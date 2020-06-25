class QuadTreeSector {
	constructor(parent, x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);

		let parentNotRoot = parent.hasOwnProperty('root');

		// Save references to parent sector and root quadtree
		this.parent = parentNotRoot ? parent:undefined;
		this.root = parentNotRoot ? parent.root:parent;
		this.depth = parentNotRoot ? parent.depth + 1:0;

		this.entities = [];
		this.sectors = [];

		this._newEntities = [];
	}

	// Creates 4 new sectors based on a parent sector
	static newQuad(parent) {
		let bound = parent.bound;
		let halfWidth = bound.width / 2;
		let halfHeight = bound.height / 2;

		// TL, TR, BL, BR
		return [
			new QuadTreeSector(parent, bound.minx, bound.miny, halfWidth, halfHeight),
			new QuadTreeSector(parent, bound.minx + halfWidth, bound.miny, halfWidth, halfHeight),
			new QuadTreeSector(parent, bound.minx, bound.miny + halfHeight, halfWidth, halfHeight),
			new QuadTreeSector(parent, bound.minx + halfWidth, bound.miny + halfHeight, halfWidth, halfHeight),
		];
	}

	// Check if this sector is directly before the last sectors in terms of depth
	isPenultimate() {
		// Tests if any child sectors have child sectors of their own
		for(let child of this.sectors)
			if(child.sectors.length) return false;

		// No child sectors found; this sector is penultimate to the bottom-most sector
		return true;
	}

	// Go up the branch and get all entities along the way
	branchEntities() {
		if(this.parent) return [...this.parent.branchEntities(), ...this.entities];

		return this.entities;
	}

	// Get all entities below and in this sector
	allEntities() {
		return [...this.sectors.map(a => a.allEntities()).flat(), ...this.entities];
	}

	update() {
		// Update children
		for(let child of this.sectors) child.update();

		this.collapse();

		this.flagged = false;
	}

	// Load many entities
	load(entities) {
		// using .add() is more optimised than using .load() for a single entity
		if(entities.length == 1) {
			this.add(entities[0]);
			return;
		}

		let rejects = [];
		let potentialEntities = [];

		// Add entities to this sector
		for(let entity of entities) {
			// Test if the given entity fits in this quadtree sector
			if(this.bound.contains(entity.bound))
				potentialEntities.push(entity);
			else rejects.push(entity);
		}

		// Divide this sector
		if(!this.sectors.length && this.depth < this.root.maxDepth && this.entities.length + potentialEntities.length > this.root.maxSize)
			this.divide();
		
		// Move entities into child sectors
		if(this.sectors.length) {
			entityLoop:
			for(let entity of potentialEntities) {
				// Test if the given entity fits in each child quadtree sector
				for(let child of this.sectors) {
					if(child.bound.contains(entity.bound)) {
						// _newEntities is a cache for entities to be later added all at once via .load()
						child._newEntities.push(entity);

						continue entityLoop;
					}
				}

				// If no child sector is viable, find all intersecting sectors
				let intersections = this.allIntersections(entity);
				for(let sector of intersections)
					sector.entities.push(entity);

				this.root.entities.push(entity);
				entity.sectors.push(...intersections);
			}

			// Load viable entities into child sectors
			for(let child of this.sectors) {
				if(child._newEntities.length) {
					child.load(child._newEntities);
					child._newEntities.length = 0;
				}
			}
		}
		// If there is no potential overfill, simply put all entities into this sector
		else {
			potentialEntities.forEach(e => e.sectors.push(this));
			this.entities.push(...potentialEntities);
			this.root.entities.push(...potentialEntities);
		}

		// Rejects contain entities that cannot fit into this quadtree sector, but were included in the entities list
		return rejects;
	}

	// Add a single entity
	add(entity, force = false) {
		// Reject entity if it does not fit inside of this sector
		if(!force && !this.bound.contains(entity.bound)) return entity;

		// Divide this sector
		if(!this.sectors.length && this.depth < this.root.maxDepth && this.entities.length + 1 > this.root.maxSize) {
			this.divide();
			this.moveEntitiesDown();
		}

		// Test if the given entity fits in each child quadtree sector
		for(let child of this.sectors) {
			// If the child was successfully added into the child sector, return from the function
			if(!child.add(entity)) return;
		}

		// If this sector has child sectors but the entity fit into none of them, find intersections instead
		if(this.sectors.length) {
			let intersections = this.allIntersections(entity);
			for(let sector of intersections) {

				sector.entities.push(entity);
			}

			entity.sectors.push(...intersections);
		}
		else {
			this.root.entities.push(entity);

			this.entities.push(entity);
			entity.sectors.push(this);
		}
	}

	remove(entity) {
		let index = this.entities.indexOf(entity);
		if(index != -1) this.entities.splice(index, 1);
	}

	// Gets every leaf sector that intersects with the given entity
	allIntersections(entity) {
		if(!this.sectors.length)
			return [this];

		let returnArray = [];

		for(let child of this.sectors) {
			if(child.bound.intersects(entity.bound))
				returnArray.push(child.allIntersections(entity));
		}

		return returnArray.flat();
	}

	// When a new entity added via .add() causes a sector to have to divide, the existing entities
	// must be moved to child sectors for optimum packing
	moveEntitiesDown() {
		let removalCache = [];

		entityLoop:
		for(let entity of this.entities) {
			// Test if this entity can be added to child sectors
			for(let child of this.sectors) {
				if(child.bound.contains(entity.bound)) {
					// Add to removal cache
					removalCache.push(entity);

					// Force add to child sector
					child.add(entity, true);

					break;
				}
			}
		}

		// Remove entities from current sector (.filter can be used here, but it is slightly slower than this impl.)
		for(let entity of removalCache) {
			entity.sectors.splice(entity.sectors.indexOf(this), 1);
			this.remove(entity);
		}

		// Move all of the entities that could not be moved into child sectors into intersecting leaf sectors
		for(let entity of this.entities) {
			entity.sectors.forEach(sector => sector.remove(entity));
			entity.sectors.length = 0;

			let intersections = this.allIntersections(entity);
			for(let sector of intersections)
				sector.entities.push(entity);

			entity.sectors.push(...intersections);
		}

		// Non-leaf sectors can't have entities
		this.entities.length = 0;
	}

	// Check this entity for movement and move it to the correct node
	recalculateEntities() {
		let outOfBounds = [];

		let sectorCache = [];
		let removalCache = [];

		entityLoop:
		for(let entity of this.entities) {
			// Do not need to recalculate the position of a static entity
			if(entity.bound.static) continue;

			// Test if entity is still encapsulated inside of this sector
			if(this.bound.contains(entity.bound)) {
				// Test if this entity can be added to child sectors
				for(let child of this.sectors) {
					if(child.bound.contains(entity.bound)) {
						let cacheIndex = sectorCache.indexOf(child);

						// Cache sector
						if(cacheIndex == -1)
							sectorCache.push(child);

						// Cache entity
						child._newEntities.push(entity);

						// Add to removal cache
						removalCache.push(entity);

						continue entityLoop;
					}
				}
			}
			else {
				// Remove entity from current sector
				this.remove(entity);

				// Travel up the branch of sectors and see if any sectors can contain this entity
				let upwardSector = this;
				while(upwardSector.parent !== undefined) {
					upwardSector = upwardSector.parent;

					// If a sector is found to be able to contain this entity, cache it to that sector
					if(upwardSector.bound.contains(entity.bound)) {
						let cacheIndex = sectorCache.indexOf(upwardSector);

						// Add sector and entity to cache
						if(cacheIndex == -1)
							sectorCache.push(upwardSector);
						
						upwardSector._newEntities.push(entity);

						continue entityLoop;
					}
				}

				outOfBounds.push(entity);
			}
		}

		// Load each list of cached entities into each cached sector
		for(let sector of sectorCache) {
			sector.load(sector._newEntities);
			sector._newEntities.length = 0;
		}

		// Remove entities from current sector (.filter can be used here, but it is slightly slower than this impl.)
		for(let entity of removalCache)
			this.remove(entity);

		// Return any entities that are no longer a part of the quadtree due to being out of bounds
		return outOfBounds;
	}

	// Giver this sector 4 child sectors
	divide() {
		this.sectors = QuadTreeSector.newQuad(this);
	}

	// Opposite of .divide()
	collapse() {
		if(!this.isPenultimate()) return;

		// Sum up all entities (Eqiv. to: this.sectors.reduce((s, a) => s = a.entities.length, this.entities.length), but more readable)
		let totalEntities = this.entities.length;
		for(let child of this.sectors) totalEntities += child.entities.length;

		// If this sector can contain all child entities, remove all children sectors
		if(totalEntities <= this.root.maxSize) {
			// Using .insert() is not required here because it is already known that every entity
			// from each child node fits inside of this parent node
			for(let child of this.sectors)
				this.entities.push(...child.entities);

			this.sectors.length = 0;
		}
	}
}

// TODO: Add line-intersecting entities to multiple sectors instead of just 1 
class QuadTree {
	constructor(x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);
		this.maxSize = 5;
		this.maxDepth = 5;

		// Main storage of entities
		this.entities = [];

		// Top most quadtree level only has 1 rectangle
		this.sector = new QuadTreeSector(this, x, y, width, height);
	}

	update() {
		let outOfBounds = [];

		entityLoop:
		for(let entity of this.entities) {
			if(entity.static) continue;

			// If the entity is contained within 1 sector, there is no need to update it until it leaves
			if(entity.sectors.length == 1 && entity.sectors[0].bound.contains(entity.bound)) continue;

			// Check if the previously intersecting sectors now fully contain this entity...
			let containerFound;
			for(let sector of entity.sectors) {
				if(sector.bound.intersects(entity.bound)) {
					// If any of this entity's sectors can contain this entity, that means the entity
					// is not intersecting any other sectors and can only be in 1 sector
					if(sector.bound.contains(entity.bound)) {
						containerFound = sector;
						break;
					}
				}
				// Remove this entity from sectors in which it is no longer intersecting
				else
					sector.remove(entity);
			}

			// ... If they do, there is no need to check for intersections
			if(containerFound != undefined) {
				entity.sectors = [containerFound];
				continue;
			}

			// Recalculate the intersecting sectors for this entity
			if(entity.sectors.length != 0 && this.recalculateSectors(entity)) continue;

			// If no spatial partitioning solution was found for this entity, add it to the outOfBounds list
			outOfBounds.push(entity);
			entity.sectors.length = 0;
		}

		for(let entity of outOfBounds)
			this.remove(entity);

		// Update quadtree to collapse and divide sectors
		this.sector.update();

		entities[0].sectors.forEach(s => s.flagged = true);
	}

	recalculateSectors(entity) {
		// Sort sectors by ascending depth to find the highest sector
		entity.sectors.sort((a, b) => a.depth - b.depth);
		let upwardSector = entity.sectors[0];

		// Travel up the branch of sectors and see if any sectors can contain this entity
		while(upwardSector.parent !== undefined) {
			upwardSector = upwardSector.parent;

			// If a sector is found to be able to contain this entity, find all leaf entities that intersect with it
			if(upwardSector.bound.contains(entity.bound)) {
				entity.sectors = upwardSector.allIntersections(entity);

				// Add this entity to each sectors' list of entities
				for(let sector of entity.sectors)
					if(sector.entities.indexOf(entity) == -1)
						sector.entities.push(entity);

				return true;
			}
		}
	}

	// Add many entities at once
	load(entities) {
		this.sector.load(entities);
	}

	// Add a single entity
	add(entity) {
		this.sector.add(entity);
	}

	remove(entity) {
		let index = this.entities.indexOf(entity);
		if(index != -1) this.entities.splice(index, 1);
	}

	// Clear entire quadtree
	clear() {
		this.sector = new QuadTreeSector(this, this.bound.minx, this.bound.miny, this.bound.width, this.bound.height);
	}

	identity() {
		return `quadtree[${this.maxSize}x${this.maxDepth}x${this.entities.length}]`;
	}
}