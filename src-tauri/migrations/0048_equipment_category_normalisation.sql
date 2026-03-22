-- Normalise equipment category to canonical grouped model.
-- Maps legacy category values to new canonical set. Unknown values become 'other'.

UPDATE equipment SET category = CASE category
  WHEN 'camera_body' THEN 'camera'
  WHEN 'lens' THEN 'lenses'
  WHEN 'camera_support' THEN 'camera_support'
  WHEN 'camera_accessory' THEN 'camera_accessories'
  WHEN 'wireless_video' THEN 'wireless_systems'
  WHEN 'wireless_fiz' THEN 'wireless_systems'
  WHEN 'lighting_fixture' THEN 'lighting'
  WHEN 'lighting_accessory' THEN 'lighting_accessories'
  WHEN 'power_distribution' THEN 'power_distribution'
  WHEN 'grip' THEN 'grip'
  WHEN 'sound' THEN 'sound'
  WHEN 'dit' THEN 'dit_video_village'
  WHEN 'monitor' THEN 'dit_video_village'
  WHEN 'consumable' THEN 'consumables'
  WHEN 'other' THEN 'other'
  ELSE 'other'
END;
