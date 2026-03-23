use serde::{Deserialize, Serialize};

const ORS_GEOCODE_URL: &str = "https://api.openrouteservice.org/geocode/search";
const ORS_DIRECTIONS_URL_BASE: &str = "https://api.openrouteservice.org/v2/directions";

#[derive(Deserialize)]
struct OrsDirectionsResponse {
    routes: Option<Vec<OrsRoute>>,
}

#[derive(Deserialize)]
struct OrsRoute {
    summary: Option<OrsSummary>,
    segments: Option<Vec<OrsSegment>>,
}

#[derive(Deserialize)]
struct OrsSummary {
    duration: Option<f64>,
    distance: Option<f64>,
}

#[derive(Deserialize)]
struct OrsSegment {
    steps: Option<Vec<OrsStep>>,
}

#[derive(Deserialize)]
struct OrsStep {
    instruction: Option<String>,
}

#[derive(Deserialize)]
struct OrsGeocodeResponse {
    features: Option<Vec<OrsGeocodeFeature>>,
}

#[derive(Deserialize)]
struct OrsGeocodeFeature {
    geometry: Option<OrsGeocodeGeometry>,
}

#[derive(Deserialize)]
struct OrsGeocodeGeometry {
    coordinates: Option<Vec<f64>>,
}

#[derive(Serialize)]
pub struct LatLngOut {
    lat: f64,
    lng: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RouteSummaryOut {
    pub duration_minutes: Option<i64>,
    pub distance_meters: Option<i64>,
    pub instructions: Vec<String>,
}

/// ORS rejects some requests (often HTTP 400) when waypoints coincide; treat as a zero-length leg.
fn is_degenerate_route(start_lat: f64, start_lng: f64, end_lat: f64, end_lng: f64) -> bool {
    const EPS_DEG: f64 = 1e-6; // ~0.1 m latitude; sufficient to collapse duplicate MO locations
    (start_lat - end_lat).abs() < EPS_DEG && (start_lng - end_lng).abs() < EPS_DEG
}

fn resolve_ors_api_key(ors_api_key: Option<String>) -> Option<String> {
    ors_api_key
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| {
            std::env::var("OPENROUTESERVICE_API_KEY")
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        })
}

fn compact_instructions(route: &OrsRoute) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let segments = match &route.segments {
        Some(v) => v,
        None => return out,
    };
    for segment in segments {
        let steps = match &segment.steps {
            Some(v) => v,
            None => continue,
        };
        for step in steps {
            let instruction = match &step.instruction {
                Some(v) => v.trim(),
                None => continue,
            };
            if instruction.is_empty() {
                continue;
            }
            // Preserve full instruction sequence exactly as returned by ORS.
            out.push(instruction.to_string());
        }
    }
    out
}

async fn get_route_summary_internal(
    start_lat: f64,
    start_lng: f64,
    end_lat: f64,
    end_lng: f64,
    profile: &str,
    ors_api_key: Option<String>,
) -> Option<RouteSummaryOut> {
    let key = resolve_ors_api_key(ors_api_key);
    let key = match key {
        Some(v) => v,
        None => {
            log::warn!("OpenRouteService API key missing; ORS lookup skipped");
            return None;
        }
    };

    if is_degenerate_route(start_lat, start_lng, end_lat, end_lng) {
        return Some(RouteSummaryOut {
            duration_minutes: Some(0),
            distance_meters: Some(0),
            instructions: Vec::new(),
        });
    }

    let request_body = serde_json::json!({
        "coordinates": [[start_lng, start_lat], [end_lng, end_lat]]
    });

    let directions_url = format!("{}/{}", ORS_DIRECTIONS_URL_BASE, profile);
    let response = match reqwest::Client::new()
        .post(directions_url)
        .header("Authorization", key)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            log::error!("OpenRouteService request failed: {}", e);
            return None;
        }
    };

    let status = response.status();
    let body_bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            log::error!("OpenRouteService response body read failed: {}", e);
            return None;
        }
    };

    if !status.is_success() {
        let preview_len = body_bytes.len().min(480);
        let preview = String::from_utf8_lossy(&body_bytes[..preview_len]);
        log::warn!(
            "OpenRouteService returned non-success status: {} body: {}",
            status,
            preview
        );
        return None;
    }

    let parsed = match serde_json::from_slice::<OrsDirectionsResponse>(&body_bytes) {
        Ok(v) => v,
        Err(e) => {
            log::error!("Failed parsing OpenRouteService response: {}", e);
            return None;
        }
    };

    let route = parsed.routes.and_then(|routes| routes.into_iter().next())?;
    let summary = route.summary.as_ref();
    let duration_minutes = summary
        .and_then(|s| s.duration)
        .filter(|seconds| *seconds >= 0.0)
        .map(|seconds| (seconds / 60.0).round() as i64);
    let distance_meters = summary
        .and_then(|s| s.distance)
        .filter(|meters| *meters >= 0.0)
        .map(|meters| meters.round() as i64);
    let instructions = compact_instructions(&route);

    Some(RouteSummaryOut {
        duration_minutes,
        distance_meters,
        instructions,
    })
}

#[tauri::command]
pub async fn get_driving_travel_time_minutes(
    start_lat: f64,
    start_lng: f64,
    end_lat: f64,
    end_lng: f64,
    ors_api_key: Option<String>,
) -> Option<i64> {
    get_route_summary_internal(
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        "driving-car",
        ors_api_key,
    )
    .await
    .and_then(|summary| summary.duration_minutes)
}

#[tauri::command]
pub async fn get_route_summary(
    start_lat: f64,
    start_lng: f64,
    end_lat: f64,
    end_lng: f64,
    profile: String,
    ors_api_key: Option<String>,
) -> Option<RouteSummaryOut> {
    let normalized_profile = match profile.trim() {
        "driving-car" => "driving-car",
        "foot-walking" => "foot-walking",
        _ => return None,
    };
    get_route_summary_internal(
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        normalized_profile,
        ors_api_key,
    )
    .await
}

#[tauri::command]
pub async fn geocode_location_to_lat_lng(
    query: String,
    ors_api_key: Option<String>,
) -> Option<LatLngOut> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return None;
    }
    let key = match resolve_ors_api_key(ors_api_key) {
        Some(v) => v,
        None => return None,
    };

    let response = match reqwest::Client::new()
        .get(ORS_GEOCODE_URL)
        .query(&[
            ("text", trimmed_query),
            ("size", "1"),
            ("api_key", key.as_str()),
        ])
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return None,
    };

    if !response.status().is_success() {
        return None;
    }
    let parsed = match response.json::<OrsGeocodeResponse>().await {
        Ok(v) => v,
        Err(_) => return None,
    };

    let coords = parsed
        .features
        .and_then(|features| features.into_iter().next())
        .and_then(|feature| feature.geometry)
        .and_then(|geometry| geometry.coordinates)
        .filter(|coordinates| coordinates.len() >= 2);

    match coords {
        Some(coordinates) => {
            let lng = coordinates[0];
            let lat = coordinates[1];
            let valid = lat.is_finite() && lng.is_finite();
            if valid {
                Some(LatLngOut { lat, lng })
            } else {
                None
            }
        }
        None => None,
    }
}
