// Three.js ray.intersects with offset canvas

var container, camera, scene, renderer, mesh,
    count = 0;

container = document.getElementById( 'reaction-diffusion-container' );
document.body.appendChild( container );

renderer = new THREE.WebGLRenderer();
renderer.setSize( container.offsetWidth, container.offsetHeight );
container.appendChild( renderer.domElement );

scene = new THREE.Scene();

camera = new THREE.PerspectiveCamera( 50, aspect(), 1, 1000 );
camera.position.y = 150;
camera.position.z = 500;
camera.lookAt( scene.position );

mesh = new THREE.Mesh(
    new THREE.BoxGeometry( 200, 200, 200, 1, 1, 1 ),
    new THREE.MeshBasicMaterial( { color : 0xff0000, wireframe: true }
) );
scene.add( mesh );

function aspect() {
    return container.offsetWidth / container.offsetHeight;
}

function render() {

    mesh.rotation.y += 0.01;

    renderer.render( scene, camera );

}

(function animate() {

    requestAnimationFrame( animate );

    render();

})();

