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

	// Debugging function
	allEntities() {
		return [...this.nodes.map(a => a.allEntities()).flat(), ...this.entities];
	}

	update() {
		// Collapsing happens from leaves to root using this method, making sure entire branches
		// are collapsed properly
		this.nodes.forEach(child => child.update());

		this.flagged = false;
		this.collapse();
	}

	// Bulk load entities into node
	load() {
		// TODO: create bulk load function
	}

	// Load single entity into node
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
			let intersections = this.allIntersections(entity);

			// Must clone array due to side effects in the succeeding loop with .addIntersecting()
			entity.nodes = Array.from(intersections);

			for(let node of intersections) {
				node.addIntersecting(entity);
			}

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
		let test = this.entities.length;
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

		// If this node can contain all child entities, collapse
		if(totalEntities.size <= this.root.maxSize) {
			let nodes = Array.from(this.nodes);
			this.nodes.length = 0;

			// Move all child entities to proper locations
			totalEntities.forEach(entity => {
				// // Remove entity from all of its previous nodes (they get recalculated directly
				// // after this)
				// entity.nodes.forEach(node => node.remove(entity));

				// If an entity only has 1 node, that means the node fully contains it, which
				// also means that the node's parent also fully contains it and it can simply
				// be added into the parent node
				if(entity.nodes.length == 1)
					this.add(entity, true);
				else
					this.root.recalculateNodes(entity);
			});
		}
	}
}