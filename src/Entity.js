// Basic entity class for testing quadtree
class Entity {
	constructor(x, y, width, height) {
		this.bound = Boundary.FromXYSize(x, y, width, height);
		this.nodes = [];
	}

	update(x, y) {
		this.bound.update(x, y);
	}

	// Debugging function
	signature() {
		return this.nodes.map(a => a.depth).join(',');
	}
}