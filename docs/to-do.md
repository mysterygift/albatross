TO–DO
1. Clicking on the show archive projects button on the productions when there are no projects crashes the app. Easily fix with a simple check if there are no projects [productions]?
3. When adding a cast member to a shot via the shot participation window, the single search bar filters the scene, shot and description using a single search bar. They should be filtered by scene number/description only.
9. Source alpha testers & collate feedback.



PEOPLE
1. Fix CrewDetailPage/CastDetailPage returning user back to the UNUSED Person page when clicking on the back arrow, should return user to Crew/Cast page respectively.
2. Cast availability – this should be editable via the Cast Manager. Allow users to enter HOLD dates and any UNAVAILABLE dates (this will flag as a clash in the DooD page)

BUDGET
~~1. Float Management: issuing to a person (from the CREW list), and reconciling float spend (cross ref with production managers to check process for HETV/Film).~~

CALL SHEET
1. Need to add text field to Call Sheet Form for safety information.
~~4. Improve parsing of location data for weather lookup – maybe we change address to have fixed fields that make it easier to use rather than relying on consistent user input. Geosearching is part of the open-meteo API. - fixed by switching to geocoding and using the superior openrouteservice geocoding API.~~


SCHEDULE
5. The script parser should look for taglines "INT./EXT. – LOCATIONAME – TIMEOFDAY" and there must be copy informing the user that this is expected formatting. Currently the parser does detect some of this but the logic is not correctly extracting the location name (AD to check regex).
6. DooD UI Cleanup
7. Generate script sides, to be shared alongside call sheet.


NICE TO HAVES:
Schedule & Budget Versioning
Moviemagic Import
Final Draft Import
When creating a new project, for a TV project you should have the TV show as a parent, with each episode as a child project. Additional scheduling for who is on which episode, and which episode is being shot when. Frankly, this would add a big layer of complexity to a project and in the interim I recommend just duplicating a project for a new episode (although this will make big file sizes for the time being).

BEFORE V1:
Encrypt Production DB + User Access Management
Migrate to PostgreSQL, and pressure test multi-user db read/write.
Check performance on local server. NB to advise users that at this stage we provide no guarantees RE data storage as this is all being stored on your computer just like any other file.