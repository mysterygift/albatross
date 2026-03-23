use serde::{Deserialize, Serialize};

const ORS_DIRECTIONS_URL: &str =
    "https://api.openrouteservice.org/v2/directions/driving-car";
const ORS_GEOCODE_URL: &str = "https://api.openrouteservice.org/geocode/search";

#[derive(Deserialize)]
struct OrsDirectionsResponse {
    routes: Option<Vec<OrsRoute>>,
}

#[derive(Deserialize)]
struct OrsRoute {
    summary: Option<OrsSummary>,
}

#[derive(Deserialize)]
struct OrsSummary {
    duration: Option<f64>,
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

#[tauri::command]
pub async fn get_driving_travel_time_minutes(
    start_lat: f64,
    start_lng: f64,
    end_lat: f64,
    end_lng: f64,
    ors_api_key: Option<String>,
) -> Option<i64> {
    let key = resolve_ors_api_key(ors_api_key);
    let key = match key {
        Some(v) => v,
        None => {
            log::warn!("OpenRouteService API key missing; ORS lookup skipped");
            return None;
        }
    };

    let request_body = serde_json::json!({
        "coordinates": [[start_lng, start_lat], [end_lng, end_lat]]
    });

    let response = match reqwest::Client::new()
        .post(ORS_DIRECTIONS_URL)
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

    if !response.status().is_success() {
        log::warn!(
            "OpenRouteService returned non-success status: {}",
            response.status()
        );
        return None;
    }

    let parsed = match response.json::<OrsDirectionsResponse>().await {
        Ok(v) => v,
        Err(e) => {
            log::error!("Failed parsing OpenRouteService response: {}", e);
            return None;
        }
    };

    let duration_seconds = parsed
        .routes
        .and_then(|routes| routes.into_iter().next())
        .and_then(|route| route.summary)
        .and_then(|summary| summary.duration);

    match duration_seconds {
        Some(seconds) if seconds >= 0.0 => Some((seconds / 60.0).round() as i64),
        _ => {
            log::warn!("OpenRouteService response had no valid route duration");
            None
        }
    }
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
