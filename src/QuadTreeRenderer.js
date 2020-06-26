const DEPTH_COLORS = ['#FC8E0D', '#F3777A', '#065CC6', '#8C0C0F'];

class QuadTreeRenderer {
	static render(ctx, quadtree) {
		ctx.lineWidth = 4;
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'center';

		// Draw quadtree boundary
		ctx.strokeStyle = 'purple';
		ctx.strokeRect(
			quadtree.bound.minx,
			quadtree.bound.miny,
			quadtree.bound.width,
			quadtree.bound.height);

		// Recursively draw all nodes of this quadtree
		QuadTreeRenderer.renderNode(ctx, quadtree.node);

		// Draw entities
		for(let entity of quadtree.entities) {
			// Draw entity boundary
			ctx.fillStyle = 'red';
			ctx.fillRect(
				entity.bound.minx,
				entity.bound.miny,
				entity.bound.width,
				entity.bound.height);

			// Draw entity depth signature
			ctx.fillStyle = 'black';
			ctx.fillText(
				entity.signature(),
				entity.bound.minx + entity.bound.width / 2,
				entity.bound.miny);
		}
	}

	static renderNode(ctx, node) {
		ctx.lineWidth = 2;
		ctx.strokeStyle = '#3399ff';
		ctx.fillStyle = DEPTH_COLORS[node.depth % (DEPTH_COLORS.length - 1)];

		// Draw node boundary
		ctx.beginPath();
		ctx.rect(
			node.bound.minx,
			node.bound.miny,
			node.bound.width,
			node.bound.height);
		ctx.fill();
		ctx.stroke();

		// Draw child nodes
		for(let child of node.nodes)
			QuadTreeRenderer.renderNode(ctx, child);
	}
}