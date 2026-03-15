TO–DO
1. Clicking on the show archive projects button on the productions when there are no projects crashes the app. Easily fix with a simple check if there are no projects [productions]?
~~2. Filtering in cast list freezes app...searching is also needed here. AD look at that tomorrow~~
3. When adding a cast member to a shot via the shot participation window, the single search bar filters the scene, shot and description using a single search bar. They should be filtered by scene number/description only.
~~4. Reduce padding in header elements in the Cast detail view.~~
~7. Add way for users to configure the crew hierachy and roles in the settings page to allow them to tailor crew structure to their production.~
8. The drop down menu for projects is buggy as hell (random crashes when clicking out of drop down menu). This should be removed and the favoured workflow should be for users to go into the productions tab and to change production there. New Project button in the top bar of each page isn't functional and is redundant. Legacy feature from first version of project.
9. Source alpha testers & collate feedback.
10. PDF EXPORTS LAYOUT CLEANUP

EQUIPMENT
~~1. Order Forms in from relevant crew (e.g. Best Boy Electric)~~
~~2. Inventory of booked equipment, when is it coming in and when is it going.~~
~~3. Inventories should generally match how they're written on their invoice.~~
~~3. Bookings can be associated with many pieces of equipment, but individual pieces of equipment cannot be associated with many bookings. A booking should have an invoice associated with it, a pickup date and a return date. Bookings should be tagged by department.~~
~~4. Rental Houses – who are we sourcing what kit from (this is from the vendor system).~~
~~5. If equipment is being supplied by a crew member (e.g. some camera operators or DoPs/1st ACs/Boom Operators provide their own equipment packages as part of their fee), who owns what kit?~~

PEOPLE
1. Fix CrewDetailPage/CastDetailPage returning user back to the UNUSED Person page when clicking on the back arrow, should return user to Crew/Cast page respectively.
2. Cast availability – this should be editable via the Cast Manager. Allow users to enter HOLD dates and any UNAVAILABLE dates (this will flag as a clash in the DooD page)

BUDGET
1. Float Management: issuing to a person (from the CREW list), and reconciling float spend (cross ref with production managers to check process for HETV/Film).

CALL SHEET
1. Need to add text field to Call Sheet Form for safety information.
2. Need to APPEND LOCATIONS type + form to include a parking address/w3w – this then needs to feed into the call sheet.
3. Add ability to watermark paperwork exports with the target's name. (+ call sheet distribution with mailto: links? Who do we even send this from? If we had this in the cloud we could use a centralised email server for it paid for by customers, but because this is free maybe it just makes you have to send them out person by person...this is tedious but quicker than sending a call sheet email one by one WITHOUT the app and automatically generates watermarks for each person too). –– THIS WOULD WORK GREAT FOR SHARING SCRIPTS TOO!


SCHEDULE
1. Add ability to create scenes in the shot list page.
2. Add ability to edit scenes, with a modal window triggered by a button. Should only be visible if a scene is selected.
3. Add ability to ADD shots to a scene.
4. Add ability to create a shoot day in the STRIPBOARD. A shoot day is initially empty with just the main unit as default. A second unit can be added if needed.
5. The script parser should look for taglines "INT./EXT. – LOCATIONAME – TIMEOFDAY" and there must be copy informing the user that this is expected formatting. Currently the parser does detect some of this but the logic is not correctly extracting the location name (AD to check regex).
6. DooD UI Cleanup
7. Beat Sheet: For simpler projects, create a simple script outlining -what we see- and -what we hear-. Works great for live productions, or simplified projects where you just want to jot your ideas down.
8. Generate script sides, to be shared alongside call sheet.
9. Movement orders?


NICE TO HAVES:
Schedule & Budget Versioning
Tutorial State
Exporting and importing Schedules...custom packaged XML file? CSV? Explore this
    NB: when importing schedules will need to have a similar approach to importing kit lists, if something is missing prompt user through everything that needs to be added.
Exporting and importing PROJECTS is probably more useful actually...but then again you may not want to reimport everything just for a small scheduling tweak.
Moviemagic Import
Final Draft Import
When creating a new project, for a TV project you should have the TV show as a parent, with each episode as a child project. Additional scheduling for who is on which episode, and which episode is being shot when. Frankly, this would add a big layer of complexity to a project and in the interim I recommend just duplicating a project for a new episode (although this will make big file sizes for the time being).

BEFORE V1:
Encrypt Production DB + User Access Management
Migrate to PostgreSQL, and pressure test multi-user db read/write.
Check performance on local server. NB to advise users that at this stage we provide no guarantees RE data storage as this is all being stored on your computer just like any other file.