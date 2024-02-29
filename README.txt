============================== PICROSS ================================

this is a web based picross game built in vanilla javascript. all the
code of the game is contained in the main.js file. the game is hosted
on https://picross.stssrn.dev. alternatively you can clone the repo and 
open index.html in a modern browser.

--- FEATURES ----------------------------------------------------------
* normal and timed game modes.
* puzzles up to 64x64 size
* sharing puzzles
* responsive design

--- GAME MODES --------------------------------------------------------
* normal mode
  * option to load a puzzle from a code
* free mode
  * same as normal mode but mistakes are not corrected and no penalty
* timed mode
  * timer counts down starting from 2 minutes
  * the grid gets larger over time, making it more difficult
* creator mode
  * the player gets to create a puzzle
  * puzzle is can be shared with a generated code

--- KNOWN ISSUES -----------------------------------------------------
* loaded puzzles aren't always 100% accurate
* cells can be unmarked in normal mode
* layout breaks when the grid is too big

--- WORK IN PROGRESS -------------------------------------------------
* add support for hints
* add support for corrections
* keyboard controls
* mobile friendly controls
* filling/marking multiple cells at once
* improve timed mode algorithm
* add time penalties
* improve ui
  * finish creator ui
  * add animations

=================================================== stssrn.dev 2024 ===
