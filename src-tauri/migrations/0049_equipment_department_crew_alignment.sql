-- Align equipment and equipment list departments with crew hierarchy department names.
-- Maps legacy/task-style labels to default crew department names; unknown values set to NULL.
-- Default crew names: Development, Production, Finance, Locations, Art, Camera, Lighting, Grip, Sound, Post-Production.

UPDATE equipment
SET department = CASE lower(trim(coalesce(department, '')))
  WHEN '' THEN NULL
  WHEN 'electrical' THEN 'Lighting'
  WHEN 'art department' THEN 'Art'
  WHEN 'post production' THEN 'Post-Production'
  WHEN 'accounts' THEN 'Finance'
  WHEN 'dit / video' THEN 'Camera'
  WHEN 'dit / video village' THEN 'Camera'
  WHEN 'development' THEN 'Development'
  WHEN 'production' THEN 'Production'
  WHEN 'finance' THEN 'Finance'
  WHEN 'locations' THEN 'Locations'
  WHEN 'art' THEN 'Art'
  WHEN 'camera' THEN 'Camera'
  WHEN 'lighting' THEN 'Lighting'
  WHEN 'grip' THEN 'Grip'
  WHEN 'sound' THEN 'Sound'
  WHEN 'post-production' THEN 'Post-Production'
  ELSE NULL
END;

UPDATE equipment_lists
SET department = CASE lower(trim(coalesce(department, '')))
  WHEN '' THEN NULL
  WHEN 'electrical' THEN 'Lighting'
  WHEN 'art department' THEN 'Art'
  WHEN 'post production' THEN 'Post-Production'
  WHEN 'accounts' THEN 'Finance'
  WHEN 'dit / video' THEN 'Camera'
  WHEN 'dit / video village' THEN 'Camera'
  WHEN 'development' THEN 'Development'
  WHEN 'production' THEN 'Production'
  WHEN 'finance' THEN 'Finance'
  WHEN 'locations' THEN 'Locations'
  WHEN 'art' THEN 'Art'
  WHEN 'camera' THEN 'Camera'
  WHEN 'lighting' THEN 'Lighting'
  WHEN 'grip' THEN 'Grip'
  WHEN 'sound' THEN 'Sound'
  WHEN 'post-production' THEN 'Post-Production'
  ELSE NULL
END;
