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

	update(x, y, width = this.width, height = this.height) {
		this.minx = x;
		this.miny = y;
		this.maxx = x + width;
		this.maxy = y + height;
	}
}

class Entity {
	constructor(x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);
	}

	update(x, y) {
		this.bound.update(x, y);
	}
}

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

	allEntities() {
		return [...this.sectors.map(a => a.allEntities()).flat(), ...this.entities];
	}

	update() {
		this.recalculateEntities();
		this.collapse();

		// Update children
		for(let child of this.sectors) child.update();
	}

	// Load many entities
	load(entities, bypass = false) {
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

				// If no child sector is viable, insert into this sector instead
				this.entities.push(entity);
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
		else
			this.entities.push(...potentialEntities);

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

		this.entities.push(entity);
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
		for(let i = 0; i < removalCache.length; i++)
			this.entities.splice(this.entities.indexOf(removalCache[i]), 1);
	}

	// Check this entity for movement and move it to the correct node
	recalculateEntities() {
		let outOfBounds = [];

		let sectorCache = [];
		let loadCache = [];
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

						// Cache entity to sector
						if(cacheIndex != -1) {
							loadCache[cacheIndex].push(entity);
						}
						else {
							sectorCache.push(child);
							loadCache.push([entity]);
						}

						// Add to removal cache
						removalCache.push(entity);

						continue entityLoop;
					}
				}
			}
			else {
				// Remove entity from current sector
				this.entities.splice(this.entities.indexOf(entity), 1);

				// Travel up the branch of sectors and see if any sectors can contain this entity
				let upwardSector = this;
				while(upwardSector.parent !== undefined) {
					upwardSector = upwardSector.parent;

					// If a sector is found to be able to contain this entity, cache it to that sector
					if(upwardSector.bound.contains(entity.bound)) {
						let cacheIndex = sectorCache.indexOf(upwardSector);

						// Add sector and entity to cache
						if(cacheIndex != -1) {
							loadCache[cacheIndex].push(entity);
						}
						else {
							sectorCache.push(upwardSector);
							loadCache.push([entity]);
						}

						continue entityLoop;
					}
				}

				outOfBounds.push(entity);
			}
		}

		// Load each list of cached entities into each cached sector
		for(let i = 0; i < sectorCache.length; i++)
			sectorCache[i].load(loadCache[i]);

		// Remove entities from current sector (.filter can be used here, but it is slightly slower than this impl.)
		for(let i = 0; i < removalCache.length; i++)
			this.entities.splice(this.entities.indexOf(removalCache[i]), 1);

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

		// Top most quadtree level only has 1 rectangle
		this.sector = new QuadTreeSector(this, x, y, width, height);
	}

	update() {
		this.sector.update();
	}

	// Add many entities at once
	load(entities) {
		this.sector.load(entities);
	}

	// Add a single entity
	add(entity) {
		this.sector.add(entity);
	}

	remove() {

	}

	// Clear entire quadtree
	clear() {
		this.sector = new QuadTreeSector(this, this.bound.minx, this.bound.miny, this.bound.width, this.bound.height);
	}

	identity() {
		return `quadtree[${this.maxSize}x${this.maxDepth}x${this.sector.allEntities().length}]`;
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

		// Recursively draw all sectors of this quadtree
		QuadTreeRenderer.renderSector(ctx, quadtree.sector);
	}

	static renderSector(ctx, sector) {
		ctx.lineWidth = 2;
		ctx.strokeStyle = '#3399ff';
		ctx.fillStyle = depthColors[sector.depth % (depthColors.length - 1)];

		ctx.beginPath();
		ctx.rect(sector.bound.minx, sector.bound.miny, sector.bound.width, sector.bound.height);
		ctx.fill();
		ctx.stroke();

		// Draw child sectors
		for(let child of sector.sectors)
			QuadTreeRenderer.renderSector(ctx, child);

		// Draw entities
		for(let entity of sector.entities) {
			ctx.fillStyle = 'red';
			ctx.fillRect(entity.bound.minx, entity.bound.miny, entity.bound.width, entity.bound.height);

			ctx.fillStyle = 'black';
			ctx.fillText(sector.depth, entity.bound.minx + entity.bound.width / 2, entity.bound.miny);
		}
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
for(let i = 0; i < 1000; i++) {
	let width = 5 + Math.random() * 5;
	let height = 5 + Math.random() * 5;

	entities.push(new Entity(Math.random() * (quadtree.bound.width - width - 1), Math.random() * (quadtree.bound.height - height - 1), width, height));
}

// Do loading tests
console.time(`Batch load ${entities.length} entities`);
quadtree.load(entities);
console.timeEnd(`Batch load ${entities.length} entities`);
quadtree.clear();

console.time(`Load ${entities.length} entities individually`);
for(let entity of entities) quadtree.add(entity);
console.timeEnd(`Load ${entities.length} entities individually`);

// Log quadtree identity
console.log(quadtree.identity());

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