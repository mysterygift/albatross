TO–DO
1. Clicking on the show archive projects button on the productions when there are no projects crashes the app. Easily fix with a simple check if there are no projects [productions]?
3. When adding a cast member to a shot via the shot participation window, the single search bar filters the scene, shot and description using a single search bar. They should be filtered by scene number/description only.
9. Source alpha testers & collate feedback.

PEOPLE
1. Fix CrewDetailPage/CastDetailPage returning user back to the UNUSED Person page when clicking on the back arrow, should return user to Crew/Cast page respectively.
2. Cast availability – this should be editable via the Cast Manager. Allow users to enter HOLD dates and any UNAVAILABLE dates (this will flag as a clash in the DooD page)
3. Generate credit lists, with support for episodes (so if they're scheduled for a particular episode, they should be included in the credit list for that episode).

BUDGET
1. Importing/Exporting to MovieMagic Budgeting. Examine file structure to make sure that the budget from albatross gets imported/exported in the correct format.
2. Improve data validation across all modal windows and cleanup some of the cramped layout of the modals.

CALL SHEET
~~1. Need to add text field to Call Sheet Form for safety information.~~

SCHEDULE
5. The script parser should look for taglines "INT./EXT. – LOCATIONAME – TIMEOFDAY" and there must be copy informing the user that this is expected formatting. Currently the parser does detect some of this but the logic is not correctly extracting the location name (AD to check regex).
6. DooD UI Cleanup
7. Generate script sides, to be shared alongside call sheet.

NICE TO HAVES:
Final Draft Import

BEFORE V1:
~~Encrypt Production DB + User Access Management~~
~~Migrate to PostgreSQL, and pressure test multi-user db read/write.~~
Check performance on local server. NB to advise users that at this stage we provide no guarantees RE data storage as this is all being stored on your computer just like any other file.

Improve error messaging in sign-in, covering "incorrect password", reasons why database wouldn't unlock, remove link to helper page (it connects to a .md file).

REFACTOR DB –
~~Plan new DB structure & research options that best support local and remote access.~~
~~Migrate to PostgreSQL.~~
~~Multiuser support – speak with JM about how he does this for PWAs.~~
Examine mobile version of albatross – how can users access their important documents on the go?
~~Security~~.