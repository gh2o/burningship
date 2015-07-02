function floating(value, link)
{
	if (!(this instanceof floating))
		return new floating(value);

	if (typeof value === 'object' && value.chunks instanceof Array)
	{
		this.chunks = link ? value.chunks : value.chunks.slice(0);
		this.exponent = value.exponent;
		this.negative = value.negative;
		return;
	}

	value = Number(value) || 0;

	if (isNaN(value))
		throw new Error('floating received NaN argument');
	if (!isFinite(value))
		throw new Error('floating received infinite argument');

	if (value === 0)
	{
		this.chunks = [];
		this.exponent = 0;
		this.negative = false;
		return;
	}

	var chunks = [];
	var exponent = 0;
	var negative = false;

	if (value < 0)
	{
		value = -value;
		negative = true;
	}

	// find largest divisor smaller than value
	if (value >= 1)
	{
		while (Math.pow(floating.chunkBound, exponent + 1) <= value)
			exponent++;
	}
	else
	{
		while (Math.pow(floating.chunkBound, exponent) > value)
			exponent--;
	}

	// divide until zero
	for (var divexpo = exponent; value !== 0; divexpo--)
	{
		var divisor = Math.pow(floating.chunkBound, divexpo);
		chunks.push(Math.floor(value / divisor));
		value %= divisor;
	}

	this.chunks = chunks;
	this.exponent = exponent;
	this.negative = negative;
}

floating.chunkExponent = 48;
floating.chunkBound = Math.pow(2, floating.chunkExponent);
floating.chunkRoot = Math.pow(2, floating.chunkExponent / 2);

floating.prototype.normalize = function() {

	var chunks = this.chunks;

	// chop off zero MSB chunks
	var zeros = 0;
	while (zeros < chunks.length && chunks[zeros] === 0)
		zeros++;

	chunks.splice(0, zeros);
	this.exponent -= zeros;

	// chop off zero LSB chunks
	while (chunks.length > 0 && chunks[chunks.length - 1] === 0)
		chunks.pop();

	// positive zero only
	if (chunks.length === 0)
	{
		this.exponent = 0;
		this.negative = false;
	}

	return this;

};

floating.prototype.compare = function(other) {
	
	if (!(other instanceof floating))
		other = floating(other);

	// both zero
	if (this.chunks.length === 0 && other.chunks.length === 0)
		return 0;
	
	// different signs
	var negative = this.negative;
	if (negative !== other.negative)
		return negative ? -1 : 1;

	// signs are same, check exponent (IMPORTANT: assumes both are normalized)
	if (this.exponent > other.exponent)
		return negative ? -1 : 1;
	if (this.exponent < other.exponent)
		return negative ? 1 : -1;

	// exponents are same, check actual chunks
	var maxlen = Math.max(this.chunks.length, other.chunks.length);
	for (var i = 0; i < maxlen; i++)
	{
		var tt = i < this.chunks.length  ? this.chunks[i]  : 0;
		var oo = i < other.chunks.length ? other.chunks[i] : 0;
		if (tt > oo)
			return negative ? -1 : 1;
		if (tt < oo)
			return negative ? 1 : -1;
	}

	return 0;

};

floating.carryForAddition = function(chunks, exponent) {

	for (var i = chunks.length - 1; i > 0; i--)
	{
		if (chunks[i] >= floating.chunkBound)
		{
			chunks[i] -= floating.chunkBound;
			chunks[i - 1] += 1;
		}
	}

	if (chunks.length > 0 && chunks[0] >= floating.chunkBound)
	{
		chunks[0] -= floating.chunkBound;
		chunks.unshift(1);
		exponent += 1;
	}

	return exponent;

};

floating.carryForSubtraction = function(chunks, exponent) {

	var flipped = false;

	for (var i = chunks.length - 1; i > 0; i--)
	{
		if (chunks[i] < 0)
		{
			chunks[i] += floating.chunkBound;
			chunks[i - 1] -= 1;
		}
	}

	if (chunks.length > 0 && chunks[0] < 0)
	{
		flipped = true;

		// last chunk must be non-zero, so remove all zero chunks
		while (chunks[chunks.length - 1] === 0)
			chunks.pop();

		if (chunks.length == 1)
		{
			// flip one chunk
			chunks[0] = -chunks[0]
		}
		else
		{
			// flip first chunk
			chunks[0] = -chunks[0] - 1;

			// flip last chunk
			chunks[chunks.length - 1] = floating.chunkBound - chunks[chunks.length - 1];

			// flip middle chunks
			for (var i = 1; i < chunks.length - 1; i++)
				chunks[i] = floating.chunkBound - chunks[i] - 1;
		}
	}

	return flipped;

};

floating.prototype.number = function() {

	var result = 0;

	for (var i = 0; i < this.chunks.length; i++)
	{
		var base = Math.pow(floating.chunkBound, this.exponent - i);
		var term = this.chunks[i] * base;

		result += term;
		if (result + base === result)
			break;
	}

	return this.negative ? -result : result;

};

floating.prototype.add = function(other) {

	if (!(other instanceof floating))
		other = floating(other);

	if (this.negative !== other.negative)
	{
		var pos = this.negative ? other : this;
		var neg = this.negative ? this : other;
		neg = floating(neg, true);
		neg.negative = false;
		return pos.sub(neg);
	}

	var thisStartExponent = this.exponent;
	var otherStartExponent = other.exponent;
	var combinedStartExponent = Math.max(thisStartExponent, otherStartExponent);

	var thisEndExponent = this.exponent - this.chunks.length;
	var otherEndExponent = other.exponent - other.chunks.length;
	var combinedEndExponent = Math.min(thisEndExponent, otherEndExponent);

	var chunks = [];
	var exponent = combinedStartExponent;

	for (var e = combinedStartExponent; e > combinedEndExponent; e--)
	{
		var tt = 0;
		if (thisEndExponent < e && e <= thisStartExponent)
			tt = this.chunks[thisStartExponent - e];

		var oo = 0;
		if (otherEndExponent < e && e <= otherStartExponent)
			oo = other.chunks[otherStartExponent - e];

		chunks.push(tt + oo);
	}

	exponent = floating.carryForAddition(chunks, exponent);

	var result = floating();
	result.chunks = chunks;
	result.exponent = exponent;
	result.negative = this.negative;
	
	return result.normalize();

};

floating.prototype.sub = function(other) {

	if (!(other instanceof floating))
		other = floating(other);

	if (this.negative !== other.negative)
	{
		var tempo = floating(other, true);
		tempo.negative = !tempo.negative;
		return this.add(tempo);
	}

	var thisStartExponent = this.exponent;
	var otherStartExponent = other.exponent;
	var combinedStartExponent = Math.max(thisStartExponent, otherStartExponent);

	var thisEndExponent = this.exponent - this.chunks.length;
	var otherEndExponent = other.exponent - other.chunks.length;
	var combinedEndExponent = Math.min(thisEndExponent, otherEndExponent);

	var chunks = [];
	var exponent = combinedStartExponent;
	var flipped = false;

	for (var e = combinedStartExponent; e > combinedEndExponent; e--)
	{
		var tt = 0;
		if (thisEndExponent < e && e <= thisStartExponent)
			tt = this.chunks[thisStartExponent - e];

		var oo = 0;
		if (otherEndExponent < e && e <= otherStartExponent)
			oo = other.chunks[otherStartExponent - e];

		chunks.push(tt - oo);
	}

	flipped = floating.carryForSubtraction(chunks, exponent);

	var result = floating();
	result.chunks = chunks;
	result.exponent = exponent;
	result.negative = this.negative !== flipped;
	
	return result.normalize();

};

floating.prototype.mul = function (other) {

	if (!(other instanceof floating))
		other = floating(other);

	var chunks = [];
	var exponent = this.exponent + other.exponent + 1;

	for (var a = 0; a < this.chunks.length; a++)
	{
		for (var b = 0; b < other.chunks.length; b++)
		{
			var ae = this.exponent - a;
			var be = other.exponent - b;

			var at = this.chunks[a];
			var bt = other.chunks[b];

			var alo = at % floating.chunkRoot;
			var ahi = Math.floor(at / floating.chunkRoot);
			var blo = bt % floating.chunkRoot;
			var bhi = Math.floor(bt / floating.chunkRoot);

			var rlo = alo * blo;
			var rhi = ahi * bhi;

			var mid = alo * bhi + blo * ahi;
			rlo += floating.chunkRoot * (mid % floating.chunkRoot);
			rhi += Math.floor(mid / floating.chunkRoot);

			var exp = ae + be;
			var ndx = exponent - exp;

			while (ndx >= chunks.length)
				chunks.push(0);

			chunks[ndx] += rlo;
			chunks[ndx - 1] += rhi;

			exponent = floating.carryForAddition(chunks, exponent);
		}
	}

	var result = floating();
	result.chunks = chunks;
	result.exponent = exponent;
	result.negative = this.negative !== other.negative;
	
	return result.normalize();

};

floating.prototype.div = function(other) {

	if (!(other instanceof floating))
		other = floating(other);
	return this.mul(other.invert());

};

floating.prototype.abs = function() {

	var result = floating(this);
	result.negative = false;
	return result.normalize();

};

floating.prototype.negate = function() {

	var result = floating(this);
	result.negative = !this.negative;
	return result.normalize();

};

floating.prototype.invert = function() {

	// check
	if (typeof this.inverted !== 'undefined')
		return this.inverted;

	// initial
	var result = floating(1 / this.number());

	// refine
	var previous;
	do {
		previous = result;
		result = previous.mul(floating(2).sub(previous.mul(this)));
		result.chunks.length = Math.min(result.chunks.length, this.chunks.length);
	} while (result.compare(previous) != 0);

	// save
	this.inverted = result;
	result.inverted = this;

	// return
	return result;

};

