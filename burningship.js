function refloat(params)
{
	for (var key in params)
	{
		var val = params[key];
		if (val.chunks instanceof Array)
			params[key] = floating(val, true);
	}
}

function worker()
{
	importScripts('floating.js');

	function messaged(event)
	{
		var params = event.data;
		refloat(params);

		var buffer = new ArrayBuffer(params.sw * params.sh * 4);
		var view = new Uint8Array(buffer);

		for (var sx = 0; sx < params.sw; sx++)
		{
			for (var sy = 0; sy < params.sh; sy++)
			{
				var x = params.x.add(floating(sx).div(params.z));
				var y = params.y.add(floating(sy).div(params.z));

				var red = 255;
				var green = 255;
				var blue = 255;

				var a = floating(0), b = floating(0);
				var i = 0;
				while (true)
				{
					a.chunks.length = Math.min(a.chunks.length, x.chunks.length * x.chunks.length * 2);
					b.chunks.length = Math.min(b.chunks.length, y.chunks.length * y.chunks.length * 2);
					var aa = a.mul(a).sub(b.mul(b));
					var bb = a.mul(b).mul(2);
					a = aa.add(x);
					b = bb.add(y);

					i += 1;

					aa = a.number();
					bb = b.number();

					if (aa * aa + bb * bb > 16)
						break;
					if (i >= 20)
						break;
				}

				var brightness = i * i / 400;
				var pixmax = brightness * 255;

				/*
				var angle = Math.atan2(b, a);
				if (angle < 0)
					angle += 2 * Math.PI;

				var hexpi = Math.PI / 3;
				var hextant = Math.floor(angle / hexpi);
				var hexphase = (angle % hexpi) / hexpi;

				switch (hextant)
				{
					case 0:
						red = pixmax;
						green = pixmax * hexphase;
						blue = 0;
						break;
					case 1:
						red = pixmax * (1 - hexphase);
						green = pixmax;
						blue = 0;
						break;
					case 2:
						red = 0;
						green = pixmax;
						blue = pixmax * hexphase;
						break;
					case 3:
						red = 0;
						green = pixmax * (1 - hexphase);
						blue = pixmax;
						break;
					case 4:
						red = pixmax * hexphase;
						green = 0;
						blue = pixmax;
						break;
					case 5:
						red = pixmax;
						green = 0;
						blue = pixmax * (1 - hexphase);
						break;
				}
				*/

				red = pixmax;
				green = pixmax;
				blue = pixmax;

				var offset = (sy * params.sw + sx) << 2;
				view[offset + 0] = red;
				view[offset + 1] = green;
				view[offset + 2] = blue;
				view[offset + 3] = 255;
			}
		}

		var message = {
			params: params,
			buffer: buffer,
		}

		postMessage(message, [buffer]);
	}

	self.addEventListener('message', messaged);
}

function page()
{
	var canvas;
	var context;

	var freeWorkers = [];
	var usedWorkers = [];
	var blockQueue = [];

	var blockSize = 128;
	var posX = floating(0), posY = floating(0), zoom = floating(256);

	for (var i = 0; i < 4; i++)
	{
		var worker = new Worker('burningship.js');
		worker.addEventListener('message', messaged);
		freeWorkers.push(worker);
	}

	function messaged(event)
	{
		var data = event.data;
		var params = data.params;
		refloat(params);

		drawBlock(params, data.buffer);

		var worker = event.target;
		var index = usedWorkers.indexOf(worker);
		usedWorkers.splice(index, 1);
		freeWorkers.push(worker);

		processQueue();
	}

	function loaded(event)
	{
		canvas = document.getElementById('main');
		context = canvas.getContext('2d');
		resized(event);
		document.body.addEventListener('click', clicked);
		document.body.addEventListener('keydown', keydowned);
	}

	function resized(event)
	{
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		triggerRedraw();
	}

	function clicked(event)
	{
		var sx = floating(event.clientX);
		var sy = floating(event.clientY);
		var pcoords = screenToPlane({x: sx, y: sy}, zoom);
		posX = pcoords.x;
		posY = pcoords.y;
		zoom = zoom.mul(50);
		triggerRedraw();
	}

	function keydowned(event)
	{
		switch (event.keyCode)
		{
			case 173:
			case 189:
				zoom = zoom.mul(Math.sqrt(0.5));
				triggerRedraw();
				break;
			case 61:
			case 187:
				zoom = zoom.mul(Math.sqrt(2));
				triggerRedraw();
				break;
			case 37:
				posX = postX.sub(floating(canvas.width / 8).div(zoom));
				triggerRedraw();
				break;
			case 39:
				posX = postX.add(floating(canvas.width / 8).div(zoom));
				triggerRedraw();
				break;
			case 38:
				posY = posY.sub(floating(canvas.height / 8).div(zoom));
				triggerRedraw();
				break;
			case 40:
				posY = posY.add(floating(canvas.height / 8).div(zoom));
				triggerRedraw();
				break;
		}
	}

	function getUpperLeft()
	{
		return {
			x: posX.sub(floating(canvas.width / 2).div(zoom)),
			y: posY.sub(floating(canvas.height / 2).div(zoom)),
		};
	}

	function screenToPlane(v, z) {
		var u = getUpperLeft();
		return {
			x: u.x.add(v.x.div(z)),
			y: u.y.add(v.y.div(z)),
		};
	}

	function planeToScreen(v, z) {
		var u = getUpperLeft();
		return {
			x: v.x.sub(u.x).mul(z),
			y: v.y.sub(u.y).mul(z),
		};
	}

	function triggerRedraw()
	{
		var newQueue = [];
		for (var sx = new floating(0); sx.compare(canvas.width) < 0; sx = sx.add(blockSize))
		{
			for (var sy = new floating(0); sy.compare(canvas.height) < 0; sy = sy.add(blockSize))
			{
				var params = screenToPlane({x: sx, y: sy}, zoom);
				params.w = floating(blockSize + 2).div(zoom);
				params.h = floating(blockSize + 2).div(zoom);
				params.z = zoom;
				params.sw = blockSize + 1;
				params.sh = blockSize + 1;
				newQueue.push(params);
 			}
		}

		blockQueue = _.shuffle(newQueue);
		processQueue();
	}

	function processQueue()
	{
		while (blockQueue.length > 0 && freeWorkers.length > 0)
		{
			var item = blockQueue.pop();
			var worker = freeWorkers.pop();
			usedWorkers.push(worker);
			worker.postMessage(item);
		}
	}

	function drawBlock(params, buffer)
	{
		if (params.z.compare(zoom) === 0)
		{

			var image = context.createImageData(params.sw, params.sh);
			image.data.set(new Uint8Array(buffer));

			var scoords = planeToScreen(params, zoom);

			context.putImageData(image, scoords.x.number(), scoords.y.number());

		}
	}

	window.addEventListener('load', loaded);
	window.addEventListener('resize', resized);
}

(typeof document !== 'undefined') ? page() : worker();
