// Global dependencies which return no modules
require('./lib/canvasRenderingContext2DExtensions');
require('./lib/extenders');
require('./lib/plugins');

// External dependencies
var Mousetrap = require('br-mousetrap');

// Method modules
var isMobileDevice = require('./lib/isMobileDevice');

// Game Objects
var SpriteArray = require('./lib/spriteArray');
var Monster = require('./lib/monster');
var Sprite = require('./lib/sprite');
var Snowboarder = require('./lib/snowboarder');
var Skier = require('./lib/skier');
var InfoBox = require('./lib/infoBox');
var Game = require('./lib/game');

// Local variables for starting the game
var mainCanvas = document.getElementById('skifree-canvas');
var dContext = mainCanvas.getContext('2d');
var imageSources = [ 'sprite-characters.png', 'skifree-objects.png' ];
var global = this;
var infoBoxControls = 'Use the mouse or WASD to control the player';
if (isMobileDevice()) infoBoxControls = 'Tap or drag on the piste to control the player';
var sprites = require('./spriteInfo');

var pixelsPerMetre = 18;
var distanceTravelledInMetres = 0;
var monsterDistanceThreshold = 2000;
var livesLeft = 5;
var highScore = 0;
var loseLifeOnObstacleHit = false;
var dropRates = {smallTree: 4, tallTree: 2, jump: 1, thickSnow: 1, rock: 1};
if (localStorage.getItem('highScore')) highScore = localStorage.getItem('highScore');

var cionic = new cionicjs.Cionic({
	streamLogger: function(msg, cls) {
		var logDiv = document.getElementById('log');
		logDiv.innerHTML += '<div class="'+cls+'">&gt;&nbsp;' + msg + '</div>';
		logDiv.scrollTop = logDiv.scrollHeight;
}});

function loadImages (sources, next) {
	var loaded = 0;
	var images = {};

	function finish () {
		loaded += 1;
		if (loaded === sources.length) {
			next(images);
		}
	}

	sources.each(function (src) {
		var im = new Image();
		im.onload = finish;
		im.src = src;
		dContext.storeLoadedImage(src, im);
	});
}

function monsterHitsSkierBehaviour(monster, skier) {
	skier.isEatenBy(monster, function () {
		livesLeft -= 1;
		monster.isFull = true;
		monster.isEating = false;
		skier.isBeingEaten = false;
		monster.setSpeed(skier.getSpeed());
		monster.stopFollowing();
		var randomPositionAbove = dContext.getRandomMapPositionAboveViewport();
		monster.setMapPositionTarget(randomPositionAbove[0], randomPositionAbove[1]);
	});
}

function startNeverEndingGame (images) {
	var player;
	var startSign;
	var infoBox;
	var game;

	// metrics
	var startTime = new Date().getTime();

	function resetGame () {
		distanceTravelledInMetres = 0;
		livesLeft = 5;
		highScore = localStorage.getItem('highScore');
		game.reset();
		game.addStaticObject(startSign);
	}

	function detectEnd () {
		if (!game.isPaused()) {
			highScore = localStorage.setItem('highScore', distanceTravelledInMetres);
			infoBox.setLines([
				'Game over!',
				'Hit space to restart'
			]);
			
			// send metrics
			if (isRecording) {
				var endTime = new Date().getTime();
				var metric = {
					startTime: startTime,
					endTime: endTime,
					score: distanceTravelledInMetres
				};
				cionic.sendJSON('metrics', metric);
			}

			game.pause();
			startTime = new Date().getTime();
			game.cycle();
		}
	}

	function randomlySpawnNPC(spawnFunction, dropRate) {
		var rateModifier = Math.max(800 - mainCanvas.width, 0);
		if (Number.random(1000 + rateModifier) <= dropRate) {
			spawnFunction();
		}
	}

	function spawnMonster () {
		var newMonster = new Monster(sprites.monster);
		var randomPosition = dContext.getRandomMapPositionAboveViewport();
		newMonster.setMapPosition(randomPosition[0], randomPosition[1]);
		newMonster.follow(player);
		newMonster.setSpeed(player.getStandardSpeed());
		newMonster.onHitting(player, monsterHitsSkierBehaviour);

		game.addMovingObject(newMonster, 'monster');
	}

	function spawnBoarder () {
		var newBoarder = new Snowboarder(sprites.snowboarder);
		var randomPositionAbove = dContext.getRandomMapPositionAboveViewport();
		var randomPositionBelow = dContext.getRandomMapPositionBelowViewport();
		newBoarder.setMapPosition(randomPositionAbove[0], randomPositionAbove[1]);
		newBoarder.setMapPositionTarget(randomPositionBelow[0], randomPositionBelow[1]);
		newBoarder.onHitting(player, sprites.snowboarder.hitBehaviour.skier);

		game.addMovingObject(newBoarder);
	}

	player = new Skier(sprites.skier);
	player.setMapPosition(0, 0);
	player.setMapPositionTarget(0, -10);
	if ( loseLifeOnObstacleHit ) {
		player.setHitObstacleCb(function() {
			livesLeft -= 1;
		});
	}

	game = new Game(mainCanvas, player);

	startSign = new Sprite(sprites.signStart);
	game.addStaticObject(startSign);
	startSign.setMapPosition(-50, 0);
	dContext.followSprite(player);

	infoBox = new InfoBox({
		initialLines : [
			'SkiFree.js',
			infoBoxControls,
			'Travelled 0m',
			'High Score: ' + highScore,
			'Skiers left: ' + livesLeft,
			'Created by Dan Hough (@basicallydan)'
		],
		position: {
			top: 15,
			right: 10
		}
	});

	game.beforeCycle(function () {
		var newObjects = [];
		if (player.isMoving) {
			newObjects = Sprite.createObjects([
				{ sprite: sprites.smallTree, dropRate: dropRates.smallTree },
				{ sprite: sprites.tallTree, dropRate: dropRates.tallTree },
				{ sprite: sprites.jump, dropRate: dropRates.jump },
				{ sprite: sprites.thickSnow, dropRate: dropRates.thickSnow },
				{ sprite: sprites.rock, dropRate: dropRates.rock },
			], {
				rateModifier: Math.max(800 - mainCanvas.width, 0),
				position: function () {
					return dContext.getRandomMapPositionBelowViewport();
				},
				player: player
			});
		}
		if (!game.isPaused()) {
			game.addStaticObjects(newObjects);

			randomlySpawnNPC(spawnBoarder, 0.1);
			distanceTravelledInMetres = parseFloat(player.getPixelsTravelledDownMountain() / pixelsPerMetre).toFixed(1);

			if (distanceTravelledInMetres > monsterDistanceThreshold) {
				randomlySpawnNPC(spawnMonster, 0.001);
			}

			infoBox.setLines([
				'SkiFree.js',
				infoBoxControls,
				'Travelled ' + distanceTravelledInMetres + 'm',
				'Skiers left: ' + livesLeft,
				'High Score: ' + highScore,
				'Created by Dan Hough (@basicallydan)',
				'Current Speed: ' + player.getSpeed()/*,
				'Skier Map Position: ' + player.mapPosition[0].toFixed(1) + ', ' + player.mapPosition[1].toFixed(1),
				'Mouse Map Position: ' + mouseMapPosition[0].toFixed(1) + ', ' + mouseMapPosition[1].toFixed(1)*/
			]);
		}
	});

	game.afterCycle(function() {
		if (livesLeft === 0) {
			detectEnd();
		}
	});

	game.addUIElement(infoBox);
	
	// $(mainCanvas)
	// .mousemove(function (e) {
	// 	game.setMouseX(e.pageX);
	// 	game.setMouseY(e.pageY);
	// 	player.resetDirection();
	// 	player.startMovingIfPossible();
	// })
	// .bind('click', function (e) {
	// 	game.setMouseX(e.pageX);
	// 	game.setMouseY(e.pageY);
	// 	player.resetDirection();
	// 	player.startMovingIfPossible();
	// })
	// .focus(); // So we can listen to events immediately

	Mousetrap.bind('f', player.speedBoost);
	Mousetrap.bind('t', player.attemptTrick);
	Mousetrap.bind(['w', 'up'], function () {
		player.stop();
	});
	Mousetrap.bind(['a', 'left'], function () {
		if (player.direction === 270) {
			player.stepWest();
		} else {
			player.turnWest();
		}
	});
	Mousetrap.bind(['s', 'down'], function () {
		player.setDirection(180);
		player.startMovingIfPossible();
	});
	Mousetrap.bind(['d', 'right'], function () {
		if (player.direction === 90) {
			player.stepEast();
		} else {
			player.turnEast();
		}
	});
	Mousetrap.bind('m', spawnMonster);
	Mousetrap.bind('b', spawnBoarder);
	Mousetrap.bind('space', resetGame);

	player.isMoving = false;
	player.setDirection(270);

	// add Cionic listeners
	cionic.addListener('37', function(isPressed) {
		if (isPressed === 'ON') {
			if (player.direction === 270) {
				player.stepWest();
			} else {
				player.turnWest();
			}
		}
	});

	cionic.addListener('39', function(isPressed) {
		if (isPressed === 'ON') {
			if (player.direction === 90) {
				player.stepEast();
			} else {
				player.turnEast();
			}
		}
	});

	cionic.addListener('38', function(isPressed) {
		if (isPressed === 'ON') player.stop();
	});

	cionic.addListener('40', function(isPressed) {
		if (isPressed === 'ON') {
			player.setDirection(180);
			player.startMovingIfPossible();
		}
	});

	cionic.addListener('record', function(action) {
		if (action == 'start') {
			startRecording();
		} else if (action == 'stop') {
			stopRecording();
		}
	}.bind(this));

	document.getElementById('cionic-connect').onclick = function () {
		var host = document.getElementById('host').value;
		cionic.Stream.socket(host);
	};

	// record the canvas
	var isRecording = false;
	var canvas = document.querySelector('canvas');
	var recordButton = document.querySelector('button#record');
	var downloadButton = document.querySelector('button#download');
	var canvasRecorder = new cionicjs.CanvasRecorder({
		canvas: canvas, 
		onStop: function() {
			var blob = new Blob(canvasRecorder._recordedBlobs, {
				type: 'video/webm'
			});
			cionic.sendBinary(blob);
		}
	});

	// hide buttons if cannot record (ie not on Chrome or Firefox)
	if (!canvasRecorder.canRecord) {
		$('#record').hide();
		$('#download').hide();
	}

	function startRecording() {
		canvasRecorder.startRecording();
		recordButton.textContent = 'Stop Recording'
		downloadButton.disabled = true;
		isRecording = true;
	}

	function stopRecording() {
		canvasRecorder.stopRecording();
		recordButton.textContent = 'Start Recording';
		downloadButton.disabled = false;
		isRecording = false;
	}

	recordButton.onclick = function() {
		if (!isRecording) {
			startRecording();
		} else {
			stopRecording();
		}
	}

	downloadButton.onclick = function() {
		var now = new Date();
		var iso = now.toISOString().split('.')[0];
		var fn = 'skiing-' + iso;
		canvasRecorder.download(fn); 
	}

	var monitorAPI = new cionicjs.MonitorAPI({verbose: false});
	monitorAPI.addPlayer(cionic);
	monitorAPI.main()

	game.start();
}

function resizeCanvas() {
	mainCanvas.width = window.innerWidth;
	mainCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas, false);

resizeCanvas();

loadImages(imageSources, startNeverEndingGame);

this.exports = window;
