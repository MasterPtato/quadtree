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

let entities = [];

// Create a bunch of random entities
for(let i = 0; i < 100; i++) {
	let width = 2 + Math.random() * 8;
	let height = 2 + Math.random() * 8;

	let newEntity = new Entity(
		Math.random() * (quadtree.bound.width - width - 1),
		Math.random() * (quadtree.bound.height - height - 1),
		width, height);

	entities.push(newEntity);
}

// Do loading tests
console.time(`Batch load ${entities.length} entities`);
quadtree.load(entities);
console.timeEnd(`Batch load ${entities.length} entities`);
quadtree.clear();

console.time(`Load ${entities.length} entities individually`);
for(let entity of entities) quadtree.add(entity);
console.timeEnd(`Load ${entities.length} entities individually`);

// Debugging help
console.log(quadtree.signature());
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
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.save();
		ctx.translate(10, 10);
		QuadTreeRenderer.render(ctx, quadtree);
	ctx.restore();
}
render();