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
	* column and row sizes need to be remembered
	* add some sort of animation after completion
	* efficient dom updates in timed mode instead of rebuilding the grid from
	  scratch
	  * create a function that takes the current grid context, and transforms
	    it into the new one
	  * we'd also have to change the labels, which would require us to store
	    a reference to the labels in a map. see if that'll actually be worth
	    implementing (and is actually faster)
	* turn it into a multi page app. when you click play in the main menu,
	  you'll be redirected to the /classic.html?params page
	* button to clear board
	* separater lines ever 5 cells

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

/** cell states */
const CELL_EMPTY    = 0,
      CELL_MARK     = 1,
      CELL_RESERVED = 2,
      CELL_FILL     = 3;

/** mode states */
const MODE_MAIN_MENU = 0,
      MODE_CLASSIC   = 1,
      MODE_TIMED     = 3,
      MODE_CREATOR   = 4;

/** user action states */
const ACT_RCLICK = 0,
      ACT_LCLICK = 1;

/** default values */
const DEFAULT_ROWS = 5,
      DEFAULT_COLS = 5;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function b64Binary(c)
{
	if (c === '+') return 62;
	if (c === '/') return 63;

	const p = c.charCodeAt();
	return p > 64 && p < 91
		? p - 65	// uppercase
		: p - 71;	// lowercase
}

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
	grid.cells[SIZE_CELL*p>>P_AU] ^= state << SIZE_CELL*p%SIZE_AU;
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

// SPEC: 0..6    row count
//       6..12   col count
//       12..EOF cell data, int bits are in reverse order
// NOTE: there seem to be weird edge cases when using size 10x10.
//       maybe its a bug in gridLabels
/** encodes a grid into a string code */
function gridEncode(grid)
{
	let s = "", bin = 0, pos = 0;
	// row / col count must be in [1..64]
	s += B64[grid.rows-1];
	s += B64[grid.cols-1];

	for (let i=0; i<grid.cells.length; i++)
	{
		let n = grid.cells[i];
		for (let j=0; j<SIZE_AU/SIZE_CELL; j++)
		{
			// note that this is encoded in reverse order
			pos++;
			bin <<= 1;
			bin ^= n & 1;
			// base 64 encodes 6 bits
			if (6 === pos)
			{
				s += B64[bin];
				pos = bin = 0;
			}
			n >>= SIZE_CELL;
		}
	}
	s += B64[bin << 6-pos];
	return s;
}

/** decode a grid code */
function gridDecode(code)
{
	const rows = b64Binary(code[0]) + 1,
	      cols = b64Binary(code[1]) + 1;

	const size = (code.length - 2) * 6 / SIZE_AU * SIZE_CELL |0;
	const cells = new Uint32Array(size);
	let d = 0, pos = 0, idx= 0;

	for (let i=0; i<code.length-2; i++)
	{
		const e = b64Binary(code[i+2]);
		for (let j=6; j>0; j--)
		{
			if (pos >= SIZE_AU)
			{
				cells[idx++] = d;
				d = pos = 0;
			}
			d ^= CELL_FILL * (e >> j-1 & 1) << pos;
			pos += SIZE_CELL;
		}
	}
	return { cells, rows, cols };
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

/** a grid is correct if it has the same labels as the solution  */
function gridCheck(g1, rLabels, cLabels)
{
	const labels1 = [rLabels, cLabels],
	      labels2 = gridLabels(g1);

	// row/col labels
	for (let i=0; i<labels1.length; i++)
	{
		if (labels1[i].length !== labels2[i].length)
		   return false;
		// row labels / col labels
		for (let j=0; j<labels1[i].length; j++)
		{
			if (labels1[i][j].length !== labels2[i][j].length)
				return false;
			// row count / col count
			for (let k=0; k<labels1[i][j].length; k++)
			{
				if (labels1[i][j][k] !== labels2[i][j][k])
					return false;
			}
		}
	}
	return true;
}

/** init dom nodes for the grid */
function gridInitDOM(ctx, root)
{
	ctx.cellPosNodeArray = new Array(ctx.grid.cols*ctx.grid.rows);
	ctx.nodeCellPosMap = new Map();
	
	// creating dom nodes
	const div  = document.createElement("div");
	
	const row  = div.cloneNode(),
	      cell = div.cloneNode();
	
	root.style.setProperty("--rows", ctx.grid.rows);
	root.style.setProperty("--cols", ctx.grid.cols);
	root.classList.add("grid");
	cell.classList.add("cell");
	row.classList.add("row");
	
	// cells
	for (let i=0; i<ctx.grid.rows*ctx.grid.cols; i++)
	{
		const node = cell.cloneNode();
		ctx.cellPosNodeArray[i] = node;
		ctx.nodeCellPosMap.set(node, i);
		root.appendChild(node);
	}

	root.addEventListener("click", (e) =>
	{
		ctx.action = e.shiftKey ? ACT_LCLICK : ACT_RCLICK;
		gridEventHandlerDOM(ctx, e);
	});

	root.addEventListener("contextmenu", (e) =>
	{
		// prevent context menu from showing
		e.preventDefault()
		ctx.action = ACT_LCLICK;
		gridEventHandlerDOM(ctx, e);
	});
}

function gridWithLabelsInitDOM(ctx, root)
{
	const div  = document.createElement("div"),
	      span = document.createElement("span");

	const gridNode         = div.cloneNode(),
	      colLabels        = div.cloneNode(),
	      rowLabels        = div.cloneNode(),
	      label            = div.cloneNode(),
	      labelText        = span.cloneNode(),
	      rowLabelsGridDiv = div.cloneNode();

	root.classList.add("grid-with-labels");
	colLabels.classList.add("top-row");
	label.classList.add("label");
	labelText.classList.add("label-text");
	rowLabels.classList.add("row-labels");
	rowLabelsGridDiv.classList.add("row-labels-grid-container");

	// top row labels
	for (let i=0; i<ctx.cLabels.length; i++)
	{
		const l = label.cloneNode(),
		      t = labelText.cloneNode();
		t.textContent = ctx.cLabels[i].join('\n') || 0;
		l.appendChild(t);
		colLabels.appendChild(l);
	}
	
	// left labels
	for (let i=0; i<ctx.rLabels.length; i++)
	{
		// label
		const l  = label.cloneNode(),
		      lt = labelText.cloneNode();
		lt.textContent = ctx.rLabels[i].join(' ') || 0;
		l.appendChild(lt);
		rowLabels.appendChild(l);
	}

	gridInitDOM(ctx, gridNode);

	root.appendChild(colLabels);
	rowLabelsGridDiv.appendChild(rowLabels);
	rowLabelsGridDiv.appendChild(gridNode);
	root.appendChild(rowLabelsGridDiv);
}

function gridEventHandlerDOM(ctx, ev)
{
	if (!ev.target.classList.contains("cell"))
	{
		return;
	}

	const p = ctx.nodeCellPosMap.get(ev.target);
	const cellAction = ctx.action === ACT_RCLICK
		? CELL_FILL
		: CELL_MARK;
	const state = gridGet(ctx.grid, p) === cellAction
		? CELL_EMPTY
		: cellAction;

	switch (ctx.mode)
	{
		case MODE_CLASSIC:
			gridSet(ctx.grid, state, p);
			ev.target.setAttribute("state", state);
			if (gridCheck(ctx.grid, ctx.rLabels, ctx.cLabels))
			{
				ctx.gridNode.style.pointerEvents = "none";
				clearInterval(ctx.intervalId);
			}
			break;

		case MODE_TIMED:
			gridSet(ctx.grid, state, p);
			ev.target.setAttribute("state", state);
			if (gridCheck(ctx.grid, ctx.rLabels, ctx.cLabels))
			{
				ctx.grid = gridCreate(5, 5);
				gridPuzzleCreateDOM(ctx, 5, 5);
				const node = document.createElement("div")
				gridWithLabelsInitDOM(ctx, node);
				ctx.gridNode.replaceWith(node);
				ctx.gridNode = node;
				ctx.level++;
				ctx.levelNode.textContent++;
				ctx.countdownBump = 60_000;
			}
			break;

		case MODE_CREATOR:
			// marking is disabled in creator mode
			if (cellAction === CELL_FILL)
			{
				gridSet(ctx.grid, state, p);
				ev.target.setAttribute("state", state);
				const encoded = gridEncode(ctx.grid);
			}
			break;
	}
}

/** create a puzzle + store the labels in ctx */
function gridPuzzleCreateDOM(ctx, rows, cols)
{
	const puzzle = gridCreate(rows, cols);
	gridRandomize(puzzle);
	const labels = gridLabels(puzzle);
	ctx.rLabels = labels[0];
	ctx.cLabels = labels[1];
}

/** initialize the time node. it shows the elapsed time */
function timerInitDOM(root)
{
	let start = Date.now();
	
	const p = document.createElement("p");
	p.classList.add("timer");
	p.textContent = "00:00:00";

	root.appendChild(p);

	return setInterval(() =>
	{
		let s = "";
		let prev = (Date.now() - start) / 1000 / 60 / 60;
		for (let i=0; i<3; i++)
		{
			const x = prev % 60 |0;
			if (i > 0) s += ':';
			// add zero padding if needed
			s += x < 10 ? `0${x}` : x
			prev *= 60;
		}
		p.textContent = s;
	}, 1000);
}

/** init dom nodes for a classic game */
function classicInitDOM(ctx, root)
{
	const div   = document.createElement("div"),
	      input = document.createElement("input");

	const button = input.cloneNode();
	button.setAttribute("type", "button");

	const gridNode   = div.cloneNode(),
	      timer      = div.cloneNode(),
	      info       = div.cloneNode(),
	      infoBottom = div.cloneNode(),
	      quit       = button.cloneNode();

	root.classList.add("classic-container");
	quit.classList.add("button");
	quit.setAttribute("value", "quit");

	// make sure to clear when navigating somewhere else
	ctx.intervalId = timerInitDOM(timer);
	gridWithLabelsInitDOM(ctx, gridNode);

	quit.addEventListener("click", () =>
	{
		if (ctx.intervalId)
			clearInterval(ctx.intervalId);
		const node = div.cloneNode();
		menuInit(ctx, node);
		root.replaceWith(node);
	});

	root.appendChild(gridNode);
	infoBottom.appendChild(quit);
	info.appendChild(timer);
	info.appendChild(infoBottom);
	root.appendChild(info);

	ctx.gridNode = gridNode;
}

/** init dom nodes for creating a nonagram */
function creatorInitDOM(ctx, root)
{
	const div = document.createElement("div");

	const grid = div.cloneNode(),
	      info = div.cloneNode();

	gridInitDOM(ctx, grid);
	root.appendChild(grid);
}

function countdownInitDOM(ctx, node)
{
	let playtime = ctx.countdownBump;
	let end = Date.now() + ctx.countdownBump;
	ctx.countdownBump = null;
	
	const p = document.createElement("p");
	p.classList.add("timer");
	p.textContent = "00:02:00.0";

	node.appendChild(p);

	const id = setInterval(() =>
	{
		if (ctx.countdownBump)
		{
			end += ctx.countdownBump;
			playtime += ctx.countdownBump;
			ctx.countdownBump = null;
		}
		let prev = (end - Date.now()) / 1000 / 60 / 60;
		if (prev > 0)
		{
			let s = "";
			for (let i=0; i<3; i++)
			{
				const x = prev % 60 |0;
				if (i > 0) s += ':';
				// add zero padding if needed
				s += x < 10 ? `0${x}` : x
				prev *= 60;
			}
			// miliseconds
			s += `.${prev / 6 % 10 |0}`;
			p.textContent = s;
		}
		else
		{
			// player lost, end round
			console.info("end,", playtime/1000);
			clearInterval(id);
			ctx.gridNode.style.pointerEvents = "none";
		}
	}, 100);
	return id;
}

/*
handles the state of:
* timer

function timer
responsibilities:
* making sure the grid is updated

responsibilities:
* making sure the grid is updated
*/
/** init dom nodes for a timed game */
function timedInitDOM(ctx, root)
{
	const div   = document.createElement("div"),
	      p     = document.createElement("p"),
	      input = document.createElement("input");

	const button = input.cloneNode();
	button.setAttribute("type", "button");

	const grid       = div.cloneNode(),
	      countdown  = div.cloneNode(),
	      info       = div.cloneNode(),
	      level      = div.cloneNode(),
	      infoBottom = div.cloneNode(),
	      quit       = button.cloneNode();

	root.classList.add("classic-container");
	quit.classList.add("button");
	quit.setAttribute("value", "quit");
	level.textContent = ctx.level = 0;
	ctx.levelNode = level;

	// make sure to clear when navigating somewhere else
	ctx.countdownBump = 120_000;
	ctx.intervalId = countdownInitDOM(ctx, countdown);
	gridWithLabelsInitDOM(ctx, grid);

	quit.addEventListener("click", () =>
	{
		if (ctx.intervalId)
			clearInterval(ctx.intervalId);
		root.replaceChildren();
		menuInit(ctx, root);
	});

	root.appendChild(grid);
	infoBottom.appendChild(level);
	infoBottom.appendChild(quit);
	info.appendChild(countdown);
	info.appendChild(infoBottom);
	root.appendChild(info);

	ctx.gridNode = grid;
}

/** init dom nodes for the main menu */
function menuInit(ctx, root)
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

	classic.classList.add("classic");
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
	// NOTE: this takes like 34ms on my old laptop which seems a little slow.
	// * see if setting the .attributes prop to  namednodemap is faster.
	// * maybe move this to html file? then we'd have to .getElement.
	// * innerhtml
	classicStart.setAttribute("value", "play");
	loadStart.setAttribute("value", "play");
	creatorStart.setAttribute("value", "Create");

	classicRowInput.setAttribute("placeholder", "row");
	classicRowInput.setAttribute("required", true);
	classicRowInput.setAttribute("min", 1);
	classicRowInput.setAttribute("max", 64);
	classicRowInput.setAttribute("type", "number");
	// NOTE: if the user changes this value, remember it
	classicRowInput.setAttribute("value", DEFAULT_ROWS);

	classicColInput.setAttribute("placeholder", "column");
	classicColInput.setAttribute("required", true);
	classicColInput.setAttribute("min", 1);
	classicColInput.setAttribute("max", 64);
	classicColInput.setAttribute("type", "number");
	classicColInput.setAttribute("value", DEFAULT_COLS);

	loadCodeInput.setAttribute("required", true);
	loadCodeInput.setAttribute("minlength", 3);
	loadCodeInput.setAttribute("pattern", "[\\w\\d\\+\/]*");

	creatorRowInput.setAttribute("placeholder", "row");
	creatorRowInput.setAttribute("type", "number");
	creatorRowInput.setAttribute("min", 1);
	creatorRowInput.setAttribute("max", 64);
	creatorRowInput.setAttribute("value", DEFAULT_ROWS);
	creatorRowInput.setAttribute("required", true);

	creatorColInput.setAttribute("placeholder", "column");
	creatorColInput.setAttribute("type", "number");
	creatorColInput.setAttribute("min", 1);
	creatorColInput.setAttribute("max", 64);
	creatorColInput.setAttribute("value", DEFAULT_COLS);
	creatorColInput.setAttribute("required", true);

	// event listeners
	classicForm.addEventListener("submit", () =>
	{
		ctx.mode = MODE_CLASSIC;
		const node = div.cloneNode(),
		      rows = +classicRowInput.value,
		      cols = +classicColInput.value;

		ctx.grid = gridCreate(rows, cols);
		gridPuzzleCreateDOM(ctx, rows, cols);
		classicInitDOM(ctx, node);
		root.replaceChildren(node);
	});

	timedStart.addEventListener("click", () =>
	{
		ctx.mode = MODE_TIMED;
		const node = div.cloneNode();
		ctx.grid = gridCreate(5, 5);
		gridPuzzleCreateDOM(ctx, ctx.grid.rows, ctx.grid.cols);
		timedInitDOM(ctx, node);
		root.replaceChildren(node);
	});

	loadForm.addEventListener("submit", () =>
	{
		ctx.mode = MODE_CLASSIC;
		const node = div.cloneNode(),
		      code = loadCodeInput.value;

		const puzzle = gridDecode(code);
		console.log(puzzle);
		ctx.grid = gridCreate(puzzle.rows, puzzle.cols);
		const labels = gridLabels(puzzle);
		ctx.rLabels = labels[0];
		ctx.cLabels = labels[1];
		classicInitDOM(ctx, node);
		root.replaceChildren(node);
	});

	creatorForm.addEventListener("submit", () =>
	{
		ctx.mode = MODE_CREATOR;
		const node = div.cloneNode(),
		      rows = +creatorRowInput.value,
		      cols = +creatorColInput.value;
		ctx.grid = gridCreate(rows, cols);
		creatorInitDOM(ctx, node);
		root.replaceChildren(node);
	});

	// putting everything together
	classic.appendChild(classicHeader);
	classicForm.appendChild(classicRowInput);
	classicForm.appendChild(classicColInput);
	classicForm.appendChild(classicStart);
	classic.appendChild(classicForm);

	load.appendChild(loadHeader);
	loadForm.appendChild(loadCodeInput);
	loadForm.appendChild(loadStart);
	load.appendChild(loadForm);

	timed.appendChild(timedStart);

	creator.appendChild(creatorHeader);
	creatorForm.appendChild(creatorRowInput);
	creatorForm.appendChild(creatorColInput);
	creatorForm.appendChild(creatorStart);
	creator.appendChild(creatorForm);

	menu.appendChild(classic);
	menu.appendChild(load);
	menu.appendChild(timed);
	menu.appendChild(creator);
	root.appendChild(menu);
}

function main()
{
	const ctx = {
		mode: MODE_MAIN_MENU,
		action: null,
		grid: null,
		rLabels: null,
		cLabels: null,
		nodeCellPosMap: null,
		cellPosNodeArray: null,
		intervalId: null,
		gridNode: null,
		level: null,
		timedLevel: null,
	};

	const root = document.getElementById("root");

	menuInit(ctx, root);
}

main();
