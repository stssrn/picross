"use strict"

/*
TODO:
	* keyboard support
	* make it look prebby
	* implement dragging to select multiple cells
	* Load and share picrosses
	* Picross Maker
	* new colors each puzzle.
	* maybe the difficulty can be estimated by the ratio of filled cells/
	  total cells. The closer it is to 1, the easier it is.
	* add hints maybe?
	* scores need to be saved in the browser.
	* add some sort of animation after completion
	* efficient dom updates in timed mode instead of rebuilding the grid from
	  scratch
	  * create a function that takes the current grid context, and transforms
	    it into the new one
	* turn it into a multi page app. when you click play in the main menu,
	  you'll be redirected to the /classic.html?params page

-- checking solution
there are multiple ways to go about this:
* check when the "check" button is pressed
  * i dont like this because it costs time when doing this "timed"
* check the entire grid when the grid changes (inefficient)
  * could be made efficient by only checking if the amount of filled cells
    is equal to the amount of filled cells in the solution.
* incremental check. when you change a cell, you check whether its row and col
  are correct. the correctness of the entire board can be stored in a bit
  array, 1 bit for each row (row + col total). if it's correct, the bit is 0,
  else 1. to check if the board is correct, we just have to check if all bits
  are 0. we then check when the fill count are equal.

it's important to keep in mind that a puzzle could have multiple correct solutions.

-- loading/sharing picrosses
* a grid needs rows*cols amount of bits.
* needs to contain the amount of cols and rows.

1. player gets the option to load a puzzle
2. player selects/enters a size.
3. player chooses a mode: timed, not timed.
4. player hits play.

/**
 * @typedef {Object} Grid
 * @property {Uint32Array} cells - cells are 2 bits each
 * @property {number} rows
 * @property {number} height
 */

const SIZE_AU   = 32,	// size of typed array unit in bits
      SIZE_CELL = 2;	// size of a cell in bits

/** power of 2 of cells typed array unit */
const P_AU = 5;

/** cell flags */
const CELL_EMPTY    = 0,
      CELL_MARK     = 1,
      CELL_RESERVED = 2,
      CELL_FILL     = 3;

// NOTE: yes the grid is global. no its not a problem because there is only 1
//       grid at most and it simplifies the code
let GRID,
    CELL_POS_NODE_ARRAY,
    NODE_CELL_POS_MAP;

/** create a new grid */
function gridCreate(rows, cols)
{
	const length = (SIZE_CELL*rows*cols>>P_AU) + 1;
	const cells = new Uint32Array(length);
	
	return { cells, rows, cols };
}

/** set the state of cell p */
function gridSet(grid, state, p)
{
	// first, clear the bits at p, then set state at p
	grid.cells[SIZE_CELL*p>>P_AU] &= ~(3 << SIZE_CELL*p%SIZE_AU);
	grid.cells[SIZE_CELL*p>>P_AU] |= state << SIZE_CELL*p%SIZE_AU;
}

/** get the value of cell p */
function gridGet(grid, p)
{
	return grid.cells[SIZE_CELL*p>>P_AU] >> SIZE_CELL*p%SIZE_AU & 3;
}

// NOTE: should randomize row*cols bits, and mask off rem
// NOTE(2): the difficulty can't really be adjusted much. one way to do it is
//          to |= the rand expression again, which gives a probability of .75
//          for a cell to be filled instead of .5
/** fill a grid with random marks */
function gridRandomize(grid)
{
	for (let i=0; i<grid.cells.length; i++)
	{
		let rand = (1 << SIZE_AU-1) * Math.random();
		for (let j=0; j<SIZE_AU-SIZE_CELL; j+=SIZE_CELL)
		{
			grid.cells[i] += (CELL_FILL << j) * ((rand >>= 1) & 1);
		}
	}
}

// NOTE: used for debugging
/** string representation of a grid */
function gridString(grid)
{
	let s = "";
	for (let i=0; i<SIZE_CELL*grid.cols*grid.rows; i+=SIZE_CELL)
	{
		if (0 === i % (SIZE_CELL*grid.cols))
		{
			s+= "\n";
		}
	
		const state = grid.cells[i>>P_AU] >> i%SIZE_AU & 3;
		switch (state)
		{
			case CELL_EMPTY:
				s += "0";
				break;
			case CELL_FILL:
				s += "1";
				break;
			case CELL_MARK:
				s += "X";
				break;
			case CELL_RESERVED:
				s += "O";
		}
	}
	return s;
}

/** get the labels of the grid (row and col count) */
function gridLabels(grid)
{
	const rLabels = new Array(grid.rows),
	      cLabels = new Array(grid.cols);

	for (let i=0; i<grid.rows; i++)
		rLabels[i] = [];

	for (let i=0; i<grid.cols; i++)
		cLabels[i] = [];
	
	for (let i=0; i<grid.rows; i++)
	{
		let state, prev;
		const label = rLabels[i];
		for (let j=0; j<grid.cols; j++)
		{
			state = gridGet(grid, i*grid.cols+j)
			if (state === CELL_FILL)
				if (prev === CELL_FILL)
					label[label.length-1]++;
				else
					label.push(1);
			prev = state;
		}
	}

	for (let i=0; i<grid.cols; i++)
	{
		let state, prev;
		const label = cLabels[i];
		for (let j=0; j<grid.rows; j++)
		{
			state = gridGet(grid, j*grid.rows+i)
			if (state === CELL_FILL)
				if (prev === CELL_FILL)
					label[label.length-1]++;
				else
					label.push(1);
			prev = state;
		}
	}

	return [rLabels, cLabels];
}

// NOTE: needs update, works but terribly inefficient
/** check if two grids are equal. grids must be the same size */
function gridEq(g1, g2)
{
	const labels1 = gridLabels(g1),
	      labels2 = gridLabels(g2);

	// row/col labels
	console.log(labels1);
	for (let i=1; i<labels1.length; i++)
	{
		// row labels / col labels
		for (let j=1; j<labels1[i].length; j++)
		{
			// row count / col count
			for (let k=1; k<labels1[i][k].length; k++)
			{
				if (labels1[i][j][k] !== labels2[i][j][k])
					return false;
			}
		}
	}
	return true;
}

function elCellStateSet(el, state)
{
	el.setAttribute("state", state);
}

/** @this CELL_MARK|CELL_FILL */
function elCellClickHandler(ev)
{
	if (ev.target.classList.contains("cell"))
	{
		// prevent opening the right click context menu
		ev.preventDefault();
		const n = NODE_CELL_POS_MAP.get(ev.target);
		const state = gridGet(GRID, n) === this ? CELL_EMPTY : this;
		gridSet(GRID, state, n);
		elCellStateSet(ev.target, state)
		console.debug(gridString(GRID));
	}
}

/*
composing components
* components have a state
* components take a mounting node, initialize on it, and the caller
* can append it to a visible node.
const gridWithLabelsOptions = {
	grid,
	labels,
	puzzle,
}
function gridWithLabelsInitDOM(root, grid, labels)
{
}
*/

// NOTE: labels and grid should be decomposed because the creator
//       doesn't need labels
/** init dom nodes for the grid */
function gridInitDOM(root, grid)
{
	const puzzle = gridCreate(grid.rows, grid.cols);
	gridRandomize(puzzle);
	console.log(gridString(puzzle));
	
	const [rLabels, cLabels] = gridLabels(puzzle);
	
	CELL_POS_NODE_ARRAY = new Array(grid.cols * grid.rows);
	NODE_CELL_POS_MAP = new Map();
	
	// creating dom nodes
	const div  = document.createElement("div"),
	      span = document.createElement("span");
	
	const info        = div.cloneNode(),
	      row         = div.cloneNode(),
	      cell        = div.cloneNode(),
	      colLabels      = div.cloneNode(),
	      rowLabels      = div.cloneNode(),
	      rowLabelsGridDiv      = div.cloneNode(),
	      gridNode      = div.cloneNode(),
	      label       = div.cloneNode(),
	      labelText   = span.cloneNode();
	
	root.classList.add("grid");
	gridNode.classList.add("cell-container");
	row.classList.add("row");
	cell.classList.add("cell");
	colLabels.classList.add("top-row");
	rowLabels.classList.add("row-labels");
	rowLabelsGridDiv.classList.add("row-labels-grid-container");
	label.classList.add("label");
	labelText.classList.add("label-text");
	
	// top row labels
	for (let i=0; i<cLabels.length; i++)
	{
		const l = label.cloneNode(),
		      t = labelText.cloneNode();
		t.textContent = cLabels[i].join(" ");
		l.appendChild(t);
		colLabels.appendChild(l);
	}
	
	// left labels and cells
	for (let i=0; i<rLabels.length; i++)
	{
		// label
		const l  = label.cloneNode(),
		      lt = labelText.cloneNode();
		lt.textContent = rLabels[i].join(" ");
		l.appendChild(lt);
		rowLabels.appendChild(l);
	}
	
	// cells
	for (let i=0; i<grid.rows*grid.cols; i++)
	{
		const node = cell.cloneNode();
		CELL_POS_NODE_ARRAY[i] = node;
		NODE_CELL_POS_MAP.set(node, i);
		gridNode.appendChild(node);
	}

	root.appendChild(colLabels);
	rowLabelsGridDiv.appendChild(rowLabels);
	rowLabelsGridDiv.appendChild(gridNode);
	root.appendChild(rowLabelsGridDiv);
	
	root.addEventListener("click", elCellClickHandler.bind(CELL_FILL));
	root.addEventListener("contextmenu", elCellClickHandler.bind(CELL_MARK));
}

/** init dom nodes for a classic game */
function classicInitDOM(root)
{

}

/** init dom nodes for creating a nonagram */
function creatorInit(root)
{
}

/** init dom nodes for a timed game */
function timedInit(root)
{
}

/** init dom nodes for the main menu */
function menuInit(root)
{
	// base nodes
	const a      = document.createElement("a"),
	      button = document.createElement("button"),
	      div    = document.createElement("div"),
	      form   = document.createElement("form"),
	      h1     = document.createElement("h1"),
	      h2     = document.createElement("h2"),
	      input  = document.createElement("input"),
	      p      = document.createElement("p");

	const start = input.cloneNode();
	start.setAttribute("type", "submit");

	// composing nodes
	const title   = h1.cloneNode(),

	      classic = div.cloneNode(),
	      creator = div.cloneNode(),
	      load    = div.cloneNode(),
	      menu    = div.cloneNode(),
	      timed   = div.cloneNode(),

	      classicForm = form.cloneNode(),
	      creatorForm = form.cloneNode(),
	      loadForm    = form.cloneNode(),

	      classicStart = start.cloneNode(),
	      creatorStart = start.cloneNode(),
	      loadStart    = start.cloneNode(),
	      timedStart   = button.cloneNode(),

	      classicHeader = h2.cloneNode(),
	      creatorHeader = h2.cloneNode(),
	      loadHeader    = h2.cloneNode(),

	      classicColInput = input.cloneNode(),
	      classicRowInput = input.cloneNode(),
	      creatorColInput = input.cloneNode(),
	      creatorRowInput = input.cloneNode(),
	      loadCodeInput   = input.cloneNode();

	classic.classList.add("clasic");
	creator.classList.add("creator");
	load.classList.add("load");
	menu.classList.add("menu");
	timed.classList.add("timed");
	title.classList.add("title");

	const headerClass = "section-header";
	classicHeader.classList.add(headerClass);
	creatorHeader.classList.add(headerClass);
	loadHeader.classList.add(headerClass);

	// setting text
	title.textContent         = "Picross";
	classicHeader.textContent = "New";
	loadHeader.textContent    = "Load";
	creatorHeader.textContent = "Create";
	timedStart.textContent    = "Timed Mode";

	// setting attributes
	classicStart.setAttribute("value", "play");
	loadStart.setAttribute("value", "play");
	creatorStart.setAttribute("value", "Create");

	classicRowInput.setAttribute("placeholder", "row");
	classicRowInput.setAttribute("required", true);
	classicRowInput.setAttribute("type", "number");
	// NOTE: if the user changes this value, remember it
	classicRowInput.setAttribute("value", 10);

	classicColInput.setAttribute("placeholder", "column");
	classicColInput.setAttribute("required", true);
	classicColInput.setAttribute("type", "number");
	classicColInput.setAttribute("value", 10);

	creatorRowInput.setAttribute("placeholder", "row");
	creatorRowInput.setAttribute("type", "number");
	creatorRowInput.setAttribute("value", 10);
	creatorColInput.setAttribute("required", "");

	creatorColInput.setAttribute("placeholder", "column");
	creatorColInput.setAttribute("type", "number");
	creatorColInput.setAttribute("value", 10);

	// event listeners
	classicStart.addEventListener("click", () => {
		if (classicForm.checkValidity())
		{
			const gridRoot = div.cloneNode(),
			      rows     = classicRowInput.value,
			      cols     = classicColInput.value;
			GRID = gridCreate(rows, cols);
			gridInitDOM(gridRoot, GRID);
			root.replaceChildren(gridRoot);
		}
	});

	// putting everything together
	classic.appendChild(classicHeader);
	classicForm.appendChild(classicColInput);
	classicForm.appendChild(classicRowInput);
	classicForm.appendChild(classicStart);
	classic.appendChild(classicForm);

	load.appendChild(loadHeader);
	load.appendChild(loadCodeInput);
	load.appendChild(loadStart);

	timed.appendChild(timedStart);

	creator.appendChild(creatorHeader);
	creator.appendChild(creatorColInput);
	creator.appendChild(creatorRowInput);
	creator.appendChild(creatorStart);

	menu.appendChild(classic);
	menu.appendChild(load);
	menu.appendChild(timed);
	menu.appendChild(creator);
	root.appendChild(menu);
}

function main()
{
	GRID = gridCreate(10, 10);

	const root = document.getElementById("root");
	const gridRoot = document.createElement("div");

	menuInit(root);
	//gridInitDOM(gridRoot, GRID);
	//root.appendChild(gridRoot);
}

main();
