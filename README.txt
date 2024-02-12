============================== PICROSS ================================

this is a web based picross game built in vanilla javascript. all the
code of the game is contained in the main.js file. the game is hosted
on picross.stssrn.dev. alternatively you can clone the repo and open
index.html in a modern browser.

this game has been heavily inspired by the game Picross DS.

--- FEATURES ----------------------------------------------------------
* exciting game modes
* puzzles up to 64x64 size
* sharing puzzles
* responsive design
* install as progressive web app

--- GAME MODES --------------------------------------------------------
* normal mode
  * optional 60 minute time limit
  * mistakes will be corrected
  * mistake adds 2 minute time penalty
  * option to load a puzzle from a code
  * hints can be enabled, which reveals the solution for one row and
    column
* free mode
  * same as normal mode but mistakes are not corrected and no penalty
* timed mode
  * timer counts down starting from 2 minutes
  * mistakes get corrected and you get a -15 second penalty
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
* mobile friendly conrols
* filling/marking multiple cells at once
* progressive web app functionality
* improve timed mode algorithm
* improve ui
  * add subgrids
  * add animations

=================================================== stssrn.dev 2024 ===
