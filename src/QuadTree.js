class QuadTree {
	constructor(x, y, width, height) {
		this.maxSize = 10;
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

			// No need to update static entities
			if(entity.bound.static) continue;

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
			this.remove(entity);
			this.outOfBounds.push(entity);
		}

		// Update quadtree to collapse nodes
		this.node.update();

		// entities[0].nodes.forEach(s => s.flagged = true);
	}

	// Used to recalculate the nodes for non-contained entities
	recalculateNodes(entity) {
		// Sort nodes by ascending depth to find the highest node
		entity.nodes.sort((a, b) => a.depth - b.depth);
		let upwardNode = entity.nodes[0];

		// Travel up the branch of nodes and see if any nodes can contain this entity
		while(upwardNode.parent !== undefined) {
			upwardNode = upwardNode.parent;

			// Find a node that is able to contain this entity, or use the top most node for
			// entities that aren't fully contained by any node of the quadtree
			if(upwardNode.bound.contains(entity.bound) ||
			   (upwardNode.depth == 0 && upwardNode.bound.intersects(entity.bound))) {
				// Find all leaf nodes that intersect with the entity
				entity.nodes = upwardNode.allIntersections(entity.bound);

				// Add this entity to each nodes' list of entities
				for(let node of entity.nodes)
					if(node.entities.indexOf(entity) == -1)
						node.addIntersecting(entity);

				return true;
			}
		}
	}

	// Find all entities in the given boundary
	query(bound) {
		return this.node.query(bound);
	}

	// Bulk load entities
	load(entities) {
		for(let entity of entities)
			this.add(entity);
	}

	// Add an entity to the quadtree
	add(entity) {
		// If this entity cannot be fully contained by the quadtree, check if it at least
		// intersects the quadtree, then add it to leaf nodes
		if(this.node.add(entity)) {
			if(this.node.bound.intersects(entity.bound)) {
				// Find all intersecting children
				let intersections = this.node.allIntersections(entity.bound);

				// Must clone array due to side effects in the succeeding loop with .addIntersecting()
				entity.nodes = [...intersections];

				for(let node of intersections)
					node.addIntersecting(entity);

				this.entities.push(entity);
			}
			else return entity;
		}
	}

	// Remove an entity from the entire quadtree
	remove(entity) {
		let index = this.entities.indexOf(entity);
		if(index != -1) {
			// Remove from all nodes
			entity.nodes.forEach(node => node.remove(entity));
			entity.nodes.length = 0;

			this.entities.splice(index, 1);
			return;
		}

		// Remove from out of bounds list
		index = this.outOfBounds.indexOf(entity);
		if(index != -1) {
			// Remove from all nodes
			entity.nodes.forEach(node => node.remove(entity));
			entity.nodes.length = 0;
			
			this.outOfBounds.splice(index, 1);
		}
	}

	// Clear entire quadtree
	clear() {
		this.entities.length = 0;
		this.outOfBounds.length = 0;

		this.node = new QuadTreeNode(this, this.bound.minx, this.bound.miny, this.bound.width, this.bound.height);
	}

	// Debug function
	signature() {
		return `quadtree[${this.maxSize}x${this.maxDepth}x${this.entities.length}]`;
	}
}