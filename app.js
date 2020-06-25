class Boundary {
	constructor(minx, miny, maxx, maxy, width, height) {
		// Assumes positive width and height
		this.minx = minx;
		this.miny = miny;
		this.maxx = maxx;
		this.maxy = maxy;

		this.width = width !== undefined ? width:this.maxx;
		this.height = height;

		this.static = false;
	}

	static FromXYSize(x, y, width, height) {
		return new Boundary(x, y, x + width, y + height, width, height);
	}

	// Test if the given boundary completely fits inside this one
	contains(boundary) {
		return this.minx < boundary.minx && this.maxx > boundary.maxx
				&& this.miny < boundary.miny && this.maxy > boundary.maxy;
	}

	intersects(boundary) {
		return this.minx < boundary.maxx && this.maxx > boundary.minx
				&& this.miny < boundary.maxy && this.maxy > boundary.miny;
	}

	update(x, y, width = this.width, height = this.height) {
		this.minx = x;
		this.miny = y;
		this.maxx = x + width;
		this.maxy = y + height;
	}
}

// Basic entity class for testing quadtree
class Entity {
	constructor(x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);
		this.nodes = [];
	}

	update(x, y) {
		this.bound.update(x, y);
	}
}

class QuadTreeNode {
	constructor(parent, x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);

		let parentNotRoot = parent.hasOwnProperty('root');

		// Save references to parent node and root quadtree
		this.parent = parentNotRoot ? parent:undefined;
		this.root = parentNotRoot ? parent.root:parent;
		this.depth = parentNotRoot ? parent.depth + 1:0;

		this.entities = [];
		this.nodes = [];
	}

	// Creates 4 new nodes based on a parent node
	static newQuad(parent) {
		let bound = parent.bound;
		let halfWidth = bound.width / 2;
		let halfHeight = bound.height / 2;

		// TL, TR, BL, BR
		return [
			new QuadTreeNode(parent, bound.minx, bound.miny, halfWidth, halfHeight),
			new QuadTreeNode(parent, bound.minx + halfWidth, bound.miny, halfWidth, halfHeight),
			new QuadTreeNode(parent, bound.minx, bound.miny + halfHeight, halfWidth, halfHeight),
			new QuadTreeNode(parent, bound.minx + halfWidth, bound.miny + halfHeight, halfWidth, halfHeight),
		];
	}

	// Check if this node is a leaf node
	isLeaf() {
		return !this.nodes.length;
	}

	// Check if this node is directly before the very last nodes in terms of depth
	isPenultimate() {
		if(this.isLeaf()) return false;

		// Tests if any child nodes have child nodes of their own
		for(let child of this.nodes)
			if(child.nodes.length) return false;

		// No grandchild nodes found; this node is penultimate
		return true;
	}

	// Debuging function
	mapit(offset = this.depth) {
		let vertLines = '|'.repeat(this.depth + 1 - offset);
		let entitySignatures = this.entities
			.map(a => a.nodes.map(b => b.depth).join(','))
			.join(' ');
		let recurse = this.nodes.map(a => a.mapit(offset)).join('');
		let entityData = this.isLeaf() ?
			`${this.entities.length}[${entitySignatures}]`:
			this.entities.length ? `bad ${this.entities.length}`:'good';

		return `${vertLines}-- ${entityData}\n` + recurse;
	}

	update() {
		// Collapsing happens from leaves to root using this method, making sure entire branches
		// are collapsed properly
		this.nodes.forEach(child => child.update());

		this.collapse();

		this.flagged = false;
	}

	add(entity, bypass = false) {
		if(!bypass && !this.bound.contains(entity.bound)) return entity;
		
		if(this.isLeaf()) {
			// Add entity to quadtree list
			if(!bypass) this.root.entities.push(entity);
			// Add entity to this node
			this.entities.push(entity);

			entity.nodes = [this];

			// If this node is full, divide it into 4 and move all entities into child nodes
			if(this.depth < this.root.maxDepth && this.entities.length > this.root.maxSize) {
				this.divide();
				this.moveEntitiesDown();
			}
		}
		else {
			// If this node has children, insert into those instead
			for(let child of this.nodes)
				if(!child.add(entity)) return;

			// If no child nodes can fully contain the entity, find all nodes that intersect
			// the entity and add the entity to each
			entity.nodes = this.allIntersections(entity);

			for(let node of entity.nodes)
				node.addIntersecting(entity);

			// Add entity to quadtree list
			if(!bypass) this.root.entities.push(entity);
		}
	}

	// This function is an abstraction of .add(), it is used when many of the checks in .add() are
	// already known such as when adding to only intersecting nodes
	addIntersecting(entity) {
		this.entities.push(entity);

		// If this node is full, divide it into 4 and move all entities into child nodes
		if(this.depth < this.root.maxDepth && this.entities.length > this.root.maxSize) {
			this.divide();
			this.moveEntitiesDown();
		}
	}

	// Remove an entity from this node
	remove(entity) {
		let index = this.entities.indexOf(entity);
		if(index != -1) this.entities.splice(index, 1);
	}

	// Gets every leaf node that intersects with the given entity
	allIntersections(entity) {
		if(!this.nodes.length)
			return [this];

		let returnArray = [];

		for(let child of this.nodes) {
			if(child.bound.intersects(entity.bound))
				returnArray.push(child.allIntersections(entity));
		}

		return returnArray.flat();
	}

	// Used to move all of a nodes' entities into its children nodes
	moveEntitiesDown() {
		// Loop backwards because of splice
		entityLoop:
		for(let i = this.entities.length - 1; i >= 0; i--) {
			let entity = this.entities[i];

			// Find viable child nodes to insert entity into
			for(let child of this.nodes) {
				if(child.bound.contains(entity.bound)) {
					this.remove(entity);

					child.add(entity, true);

					continue entityLoop;
				}
			}

			// When no child nodes are found, remove node from list and add all
			// intersecting child nodes
			entity.nodes.splice(entity.nodes.indexOf(this), 1);
			let newNodes = this.allIntersections(entity);
			entity.nodes.push(...newNodes);
			
			// Add entity to all new nodes
			for(let node of newNodes)
				node.addIntersecting(entity);

			this.remove(entity);
		}
	}

	// Divide the node into 4
	divide() {
		this.nodes = QuadTreeNode.newQuad(this);
	}

	// Opposite of .divide()
	collapse() {
		// Only nodes that are directly before leaves should collapse
		if(!this.isPenultimate()) return;

		// Sum up all unique entities
		let totalEntities = new Set();
		let test = 0;
		for(let child of this.nodes) {
			for(let entity of child.entities) {
				totalEntities.add(entity);
				test ++;
			}
		}

		// TODO: Fix collapse and divide issues
		// It divides without any reason to, and doesn't collapse when it should
		console.log(totalEntities.size, test);

		// If this node can contain all child entities, collapse
		if(totalEntities.size <= this.root.maxSize) {
			let nodes = Array.from(this.nodes);
			this.nodes.length = 0;

			// Move all child entities to proper locations
			for(let child of nodes) {
				for(let entity of child.entities) {
					// // Remove entity from all of its previous nodes (they get recalculated directly
					// // after this)
					// entity.nodes.forEach(node => node.remove(entity));

					// If an entity only has 1 node, that means the node fully contains it, which
					// allows also means that the node's parent also fully contains it and it can
					// simply be added into the parent node
					if(entity.nodes.length == 1)
						this.add(entity, true);
					else
						this.root.recalculateNodes(entity);
				}
			}
		}
	}
}

class QuadTree {
	constructor(x, y, width, height) {
		this.maxSize = 5;
		this.maxDepth = 5;

		this.entities = [];
		this.outOfBounds = [];

		this.node = new QuadTreeNode(this, x, y, width, height);
	}

	get bound() {
		return this.node.bound;
	}

	// Updates the quadtree and recalculate for moving entities
	update() {
		// Attempt to re-add out-of-bounds entities
		for(let i = this.outOfBounds.length - 1; i >= 0; i--) {
			if(!this.add(this.outOfBounds[i]))
				this.outOfBounds.splice(i, 1);
		}

		// Backwards loop because of .splice
		for(let i = this.entities.length - 1; i >= 0; i--) {
			let entity = this.entities[i];

			// If an entity is only part of 1 node, that means it is fully contained by that node.
			// This allows for the assumption that if it remains contained by that node, no further
			// calculations are required
			if(entity.nodes.length == 1) {
				if(entity.nodes[0].bound.contains(entity.bound)) continue;

				// Remove entity from node
				entity.nodes[0].remove(entity);
			}
			else {
				// Check if the previously intersecting nodes now fully contain this entity...
				let containerFound;
				for(let node of entity.nodes) {
					if(!containerFound && node.bound.intersects(entity.bound)) {
						// If any of this entity's nodes can contain this entity, that means the
						// entity is not intersecting any other nodes and can only be in 1 node
						if(node.bound.contains(entity.bound))
							containerFound = node;
					}
					// Remove this entity from nodes it is no longer intersecting
					else
						node.remove(entity);
				}

				// ... If they do, there is no need to check for intersections; the entity is fully
				// contained
				if(containerFound != undefined) {
					entity.nodes = [containerFound];
					continue;
				}
			}

			// Recalculate the intersecting nodes for this entity
			if(entity.nodes.length != 0 && this.recalculateNodes(entity)) continue;

			// If no spatial partitioning solution was found for this entity, add it to the
			// outOfBounds list
			this.outOfBounds.push(entity);
			this.remove(entity);
		}

		// Update quadtree to collapse nodes
		this.node.update();

		entities[0].nodes.forEach(s => s.flagged = true);
	}

	// Used to recalculate the nodes for non-contained entities
	recalculateNodes(entity) {
		// Sort nodes by ascending depth to find the highest node
		entity.nodes.sort((a, b) => a.depth - b.depth);
		let upwardNode = entity.nodes[0];

		// Travel up the branch of nodes and see if any nodes can contain this entity
		while(upwardNode.parent !== undefined) {
			upwardNode = upwardNode.parent;

			// Find a node that is able to contain this entity
			if(upwardNode.bound.contains(entity.bound)) {
				// Find all leaf nodes that intersect with the entity
				entity.nodes = upwardNode.allIntersections(entity);

				// Add this entity to each nodes' list of entities
				for(let node of entity.nodes)
					if(node.entities.indexOf(entity) == -1)
						node.addIntersecting(entity);

				return true;
			}
		}
	}

	// Add an entity to the quadtree
	add(entity) {
		return this.node.add(entity);
	}

	// Remove an entity from the entire quadtree
	remove(entity) {
		let index = this.entities.indexOf(entity);
		if(index != -1) {
			// Remove from all nodes
			entity.nodes.forEach(node => node.remove(entity));
			entity.nodes.length = 0;

			this.entities.splice(index, 1);
		}
	}

	// Debug function
	identity() {
		return `quadtree[${this.maxSize}x${this.maxDepth}x${this.entities.length}]`;
	}
}

let depthColors = ['#FC8E0D', '#F3777A', '#065CC6', '#8C0C0F'];
class QuadTreeRenderer {
	static render(ctx, quadtree) {
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'purple';
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'center';

		ctx.strokeRect(quadtree.bound.minx, quadtree.bound.miny, quadtree.bound.width, quadtree.bound.height);

		// Recursively draw all nodes of this quadtree
		QuadTreeRenderer.renderNode(ctx, quadtree.node);

		// Draw entities
		for(let entity of quadtree.entities) {
			ctx.fillStyle = 'red';
			ctx.fillRect(entity.bound.minx, entity.bound.miny, entity.bound.width, entity.bound.height);

			ctx.fillStyle = 'black';
			ctx.fillText(entity.nodes.map(a => a.depth).join(','), entity.bound.minx + entity.bound.width / 2, entity.bound.miny);
		}
	}

	static renderNode(ctx, node) {
		ctx.lineWidth = 2;
		ctx.strokeStyle = '#3399ff';
		ctx.fillStyle = depthColors[node.depth % (depthColors.length - 1)];
		ctx.fillStyle = node.flagged ? 'white':depthColors;

		ctx.beginPath();
		ctx.rect(node.bound.minx, node.bound.miny, node.bound.width, node.bound.height);
		ctx.fill();
		ctx.stroke();

		// Draw child nodes
		for(let child of node.nodes)
			QuadTreeRenderer.renderNode(ctx, child);
	}
}

// Initiate quadtree
let quadtree = new QuadTree(0, 0, 750, 750);
quadtree.maxSize = 2;

// Initate canvas
let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d');

// Resize canvas
canvas.width = quadtree.bound.width + 20;
canvas.height = quadtree.bound.height + 20;
document.body.append(canvas);

// Create a bunch of random entities
let entities = [];
for(let i = 0; i < 100; i++) {
	let width = 2 + Math.random() * 8;
	let height = 2 + Math.random() * 8;

	let newEntity = new Entity(Math.random() * (quadtree.bound.width - width - 1), Math.random() * (quadtree.bound.height - height - 1), width, height);
	// if(Math.random() > 0.5) newEntity.bound.static = true;
	entities.push(newEntity);
}
// entities.push(
// 	new Entity(400, 400, 10, 10),
// 	new Entity(415, 400, 10, 10),
// 	new Entity(400, 415, 10, 10),
// 	new Entity(415, 415, 10, 10));

// Do loading tests
// console.time(`Batch load ${entities.length} entities`);
// quadtree.load(entities);
// console.timeEnd(`Batch load ${entities.length} entities`);
// quadtree.clear();

console.time(`Load ${entities.length} entities individually`);
for(let entity of entities) quadtree.add(entity);
console.timeEnd(`Load ${entities.length} entities individually`);

// Debugging help
console.log(quadtree.identity());
// console.log(quadtree.node.mapit());

// Create mouse handlers
let mouseDown = false;
window.addEventListener('mousedown', e => {
	if(e.button == 0) {
		mouseDown = true;

		entities[0].update(e.clientX - 10, e.clientY - 10);
		console.time(`Update ${entities.length} entities`);
		quadtree.update();
		console.timeEnd(`Update ${entities.length} entities`);

		console.time(`Render ${entities.length} entities`);
		render();
		console.timeEnd(`Render ${entities.length} entities`);
	}
});
window.addEventListener('mouseup', e => {
	if(e.button == 0) mouseDown = false;
});

window.addEventListener('mousemove', e => {
	if(mouseDown) {	
		entities[0].update(e.clientX - 10, e.clientY - 10);
		quadtree.update();
		render();
	}
});

// Animate everything
function render() {
	// window.requestAnimationFrame(render);

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.save();
		ctx.translate(10, 10);
		QuadTreeRenderer.render(ctx, quadtree);
	ctx.restore();
}
render();