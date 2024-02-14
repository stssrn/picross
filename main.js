/*
Picross AGPL Source Code
Copyright (C) 2024 Sergio Tasseron

--- TODO ----------------------------------------------------------------------
* add hints
* keyboard support
* make it look prebby
* implement dragging to select multiple cells
* new colors each puzzle.
* maybe the difficulty can be estimated by the ratio of filled cells/
  total cells. The closer it is to 1, the easier it is.
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
* separator grid lines ever n cells
  * n could be determined by prime factoring the row/col count. n will be
    whichever factor is closest to 5. the total amount of cells in a subgrid
    must be greater than 4, otherwise the subgrids are too small.

--- CHECKING THE GRID  --------------------------------------------------------
a solution is considered correct if cells states align with the labels of the
solution. a puzzle could however have multiple correct solutions. so a move is
incorrect if it puts the grid in a state such that no correct solutions are
possible. figuring out all the correct solutions is however computationally
challenging.

approach 1: only generate unambiguous puzzles. this however doesn't stop
people from creating ambiguous puzzles and sharing them with others. in order
to do this, we must understand what makes a puzzle unambiguos.

   one observation i made is that the more even the ratio of filled to empty
cells is, the more solutions there are. if this is true, we should not use an
uniform probability distribution. this would be the easiest solution to genera-
ting fair puzzles, but would make the puzzles a bit easier on average.

approach 2: if it turns out that it's possible to derive all possible solutions
can be derived if you have one of them. it'd become trivial to determine the
solution set.

approach 3: if the player makes a move that differs from the solution, let the
computer try to solve it from that point using some algorithm. this works if
there are only few cells left that havent been filled or marked yet, otherwise
it would take too long. perhaps we can find an accurate heuristic function that
could be used to determine if the grid is in an unsolvable state.

approach 4: remove the penalty mechanic, which means there is only free mode.
then we'd only have to check the labels of the player's grid and the solution
grid. the player wins if the labels are equivalent.

--- CROSSING OUT LABEL NUMBERS ------------------------------------------------
numbers of labels are crossed out of the places for these numbers have been 
placed on the grid. numbers need to be marked if there is a line connected with
an edge of the grid.

1. user clicks on cell
2. place the mark/fill
3. update the labels

in order to update the labels, we need to figure out what the labels are for
the row and column of the clicked cell, and the the corresponding labels of the
solution. we have to determine the labels, from the edge of the row/column to
the last set cell in the row/column. then we compare these values with the
labels of the solution. then we can figure out what labels need to be changed

to change the label, we need to know the dom node of the label. the easies way
to achieve this is to group the dom nodes together with the label in an object.

we probably don't want to check the grids of the entire board on every click,
and only update the we know could be affected.

--- IMPLEMENTATION QUIRKS -----------------------------------------------------
gridDecode returns a grid with empty labels. it'd make more sense to update
them as part of the process. i decided not to do this to keep it consistent
with gridCreate. i should change this
*/
"use strict"

/**
 * @typedef {Object} Grid
 * @property {Uint32Array} cells - cells are 2 bits each
 * @property {number} rows
 * @property {number} height
 * @property {Labels} labels
 */

/**
 * @typedef {Object}  Labels
 * @propery {number[][]} row
 * @propery {number[][]} col
 */

/** global context */
let ctx;

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

const PRIMES = [ 2, 3, 5, 7, 11, 13, 17, 19, 23, 27, 31 ];

/**
 * the size of a subgrid are the smallest pair of prime factors of the row
 * count and col count, such that its product is greater than 20
 */
function subgridSize(grid)
{
	let cols, rows;
	for (let i=0; i<PRIMES.length; i++)
	{
		if (grid.rows % PRIMES[i] === 0) rows = PRIMES[i];
		if (cols * rows > 20) break;
		if (grid.cols % PRIMES[i] === 0) cols = PRIMES[i];
		if (cols * rows > 20) break;
	}
	return [rows ?? grid.rows, cols ?? grid.cols];
}

/** create a new grid */
function gridCreate(rows, cols)
{
	const length = (SIZE_CELL*rows*cols>>P_AU) + 1;
	const cells = new Uint32Array(length);
	
	return { cells, rows, cols, labels: { row: [], col: [] } };
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
//       maybe its a bug in gridUpdateLabels
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
	return { cells, rows, cols, labels: { x: [], y: [] } };
}

/** update the label props of the grid */
function gridUpdateLabels(grid)
{
	const rLabels = grid.labels.row,
	      cLabels = grid.labels.col;

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
}

/** a grid is correct if it has the same labels as the solution  */
function gridCheck(g1, g2)
{
	if (g1.labels.row.length !== g2.labels.row.length)
		return false;
	if (g1.labels.col.length !== g2.labels.col.length)
		return false;

	for (let i=0; i<g1.labels.row.length; i++)
	{
		if (g1.labels.row[i].length !== g2.labels.row[i].length)
			return false;

		for (let j=0; j<g1.labels.row[i].length; j++)
		{
			if (g1.labels.row[i][j] !== g2.labels.row[i][j])
				return false;
		}
	}

	for (let i=0; i<g1.labels.col.length; i++)
	{
		if (g1.labels.col[i].length !== g2.labels.col[i].length)
			return false;

		for (let j=0; j<g1.labels.col[i].length; j++)
		{
			if (g1.labels.col[i][j] !== g2.labels.col[i][j])
				return false;
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
	const { rows, cols } = ctx.grid;
	const [subgridRows, subgridCols] = subgridSize(ctx.grid);
	
	const subgridColor = "slateblue"
	for (let i=0; i<rows*cols; i++)
	{
		const node = cell.cloneNode();
		if (i % subgridCols === 0 && i % cols !== 0)
		{
			node.style.borderLeftColor = subgridColor;
		}
		if ((i+1) % subgridCols === 0 && (i+1) % cols !== 0)
		{
			node.style.borderRightColor = subgridColor;
		}
		if ((i/cols |0) % subgridRows === 0 && i > cols)
		{
			node.style.borderTopColor = subgridColor;
		}
		if ((i/cols+1 |0) % subgridRows === 0 && i < rows*(cols-1))
		{
			node.style.borderBottomColor = subgridColor;
		}
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
	ctx.labelNodes = { row: [], col: [] };

	// column labels
	for (let i=0; i<ctx.puzzle.labels.col.length; i++)
	{
		const l  = label.cloneNode(),
		      lt = labelText.cloneNode();
		ctx.labelNodes.col.push([]);
		if (0 === ctx.puzzle.labels.col[i].length)
		{
			const n = span.cloneNode();
			n.textContent = 0;
			lt.appendChild(n);
		}
		else
		{
			for (let j=0; j<ctx.puzzle.labels.col[i].length; j++)
			{
				const n = span.cloneNode();
				n.textContent = ctx.puzzle.labels.col[i][j];
				ctx.labelNodes.col[i][j] = n;
				lt.appendChild(n)
			}
		}
		l.appendChild(lt);
		colLabels.appendChild(l);
	}
	
	// row labels
	for (let i=0; i<ctx.puzzle.labels.row.length; i++)
	{
		const l  = label.cloneNode(),
		      lt = labelText.cloneNode();
		ctx.labelNodes.row.push([]);
		if (0 === ctx.puzzle.labels.row[i].length)
		{
			const n = span.cloneNode();
			n.textContent = 0;
			lt.appendChild(n);
		}
		else
		{
			for (let j=0; j<ctx.puzzle.labels.row[i].length; j++)
			{
				const n = span.cloneNode();
				n.textContent = ctx.puzzle.labels.row[i][j];
				ctx.labelNodes.row[i][j] = n;
				lt.appendChild(n)
			}
		}
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
			gridUpdateLabels(ctx.grid);

			// NOTE: lots of duplicate code, needs refactoring
			// crossout label logic
			const col = p % ctx.grid.cols;
			const row = p / ctx.grid.cols |0;

			// top to bottom
			const colLabelTop = [];
			{
				// current count of consecutive filled cells
				let count = 0;
				for (let i=0; i<ctx.grid.rows; i++)
				{
					const c = gridGet(ctx.grid, ctx.grid.rows*i+col);
					if (c === CELL_EMPTY)
						break;
					else if (c === CELL_FILL)
						count++;
					else if (c === CELL_MARK && count > 0)
					{
						colLabelTop.push(count);
						count = 0;
					}
				}
				if (count === ctx.grid.rows)
					colLabelTop.push(count);
			}

			// bottom to top
			const colLabelBottom = [];
			{
				let count = 0;
				for (let i=ctx.grid.rows-1; i>0; i--)
				{
					const c = gridGet(ctx.grid, ctx.grid.rows*i+col);
					if (c === CELL_EMPTY)
						break;
					else if (c === CELL_FILL)
						count++;
					else if (c === CELL_MARK && count > 0)
					{
						colLabelBottom.push(count);
						count = 0;
					}
				}
			}

			// left to right
			const rowLabelLeft = [];
			{
				// current count of consecutive filled cells
				let count = 0;
				for (let i=0; i<ctx.grid.cols; i++)
				{
					const c = gridGet(ctx.grid, ctx.grid.cols*row+i);
					if (c === CELL_EMPTY)
						break;
					else if (c === CELL_FILL)
						count++;
					else if (c === CELL_MARK && count > 0)
					{
						rowLabelLeft.push(count);
						count = 0;
					}
				}
				if (count === ctx.grid.cols)
					rowLabelLeft.push(count);
			}

			// right to left
			const rowLabelRight = [];
			{
				let count = 0;
				for (let i=ctx.grid.cols-1; i>0; i--)
				{
					const c = gridGet(ctx.grid, ctx.grid.cols*row+i);
					if (c === CELL_EMPTY)
						break;
					else if (c === CELL_FILL)
						count++;
					else if (c === CELL_MARK && count > 0)
					{
						rowLabelRight.push(count);
						count = 0;
					}
				}
			}

			// merging the col label lists
			const colLabel = [];
			for (let i=0; i<ctx.puzzle.labels.col[col].length; i++)
			{
				colLabel[i] = colLabelTop[i]
					?? colLabelBottom[ctx.puzzle.labels.col[col].length-i-1];
			}

			// merging the row label lists
			const rowLabel = [];
			for (let i=0; i<ctx.puzzle.labels.row[row].length; i++)
			{
				rowLabel[i] = rowLabelLeft[i]
					?? rowLabelRight[ctx.puzzle.labels.row[row].length-i-1];
			}

			// adding crossed class to crossed labels
			for (let i=0; i<colLabel.length; i++)
			{
				if (colLabel[i] === ctx.puzzle.labels.col[col][i])
					ctx.labelNodes.col[col][i].classList.add("crossed");
			}

			for (let i=0; i<rowLabel.length; i++)
			{
				if (rowLabel[i] === ctx.puzzle.labels.row[row][i])
					ctx.labelNodes.row[row][i].classList.add("crossed");
			}

			if (gridCheck(ctx.grid, ctx.puzzle))
			{
				ctx.gridNode.style.pointerEvents = "none";
				clearInterval(ctx.intervalId);
			}
			break;

		case MODE_TIMED:
			gridSet(ctx.grid, state, p);
			ev.target.setAttribute("state", state);
			gridUpdateLabels(ctx.grid);
			if (gridCheck(ctx.grid, ctx.puzzle))
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
	ctx.puzzle = gridCreate(rows, cols);
	gridRandomize(ctx.puzzle);
	gridUpdateLabels(ctx.puzzle);
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
		gridUpdateLabels(puzzle);
		console.log(puzzle);
		ctx.grid = gridCreate(puzzle.rows, puzzle.cols);
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
	ctx = {
		mode: MODE_MAIN_MENU,
		action: null,
		grid: null,
		rLabels: null,
		cLabels: null,
		mistakeCount: null,
		nodeCellPosMap: null,
		cellPosNodeArray: null,
		intervalId: null,
		gridNode: null,
		labelNodes: null,
		level: null,
		timedLevel: null,
	};

	const root = document.getElementById("root");

	menuInit(ctx, root);
}

main();
