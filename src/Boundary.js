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

	updateXY(x, y, width = this.width, height = this.height) {
		if(this.static) throw new Error('Cannot update a static boundary');

		this.minx = x;
		this.miny = y;
		this.maxx = x + width;
		this.maxy = y + height;
	}

	update(minx, miny, maxx, maxy) {
		this.minx = minx;
		this.miny = miny;
		this.maxx = maxx;
		this.maxy = maxy;
	}
}