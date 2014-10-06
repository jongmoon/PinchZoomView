(function($) {
	var datakey = "__pzv__";
	var nMinMultiply = 0.5;
	
    $.fn.pinchZoomView = function(options) {
    	var instance, args, m, ret;
    	
    	if (typeof options === 'string') {
			ret = [];
			args = Array.prototype.slice.call(arguments, 1);
			this.each(function() {
				instance = $.data(this, datakey);

				if (!instance) {
					ret.push(undefined);

				// Ignore methods beginning with `_`
				} else if (options.charAt(0) !== '_' &&
					typeof (m = instance[ options ]) === 'function' &&
					// If nothing is returned, do not add to return values
					(m = m.apply(instance, args)) !== undefined) {

					ret.push(m);
				}
			});

			// Return an array of values for the jQuery instances
			// Or the value itself if there is only one
			// Or keep chaining
			return ret.length ? (ret.length === 1 ? ret[0] : ret) : this;
		}
    	
        return this.each(function() {
            return new PinchZoomView(this);
        });
    };
    
    
    function PinchZoomView(el) {
    	// 엘리먼트에 대해 PinchZoomView 중복 인스턴스 생성 방지
		var d = $.data(el, datakey);
		if (d) {
			return d;
		}
    	this._$el = $(el);
		
//		this.option({
//			nMaxScale : 4.0,
//		});
//		
//		this.option(htUserOption || {});
		
		this._initVar();
		this._attachEvent();
		this._setTrans();
		
		//console.log(this);
		// Save the instance
		$.data(el, datakey, this);
    }
    
    PinchZoomView.prototype = {
    	_initVar : function() {
    		this._oTargetInfo = null;
    		
    		this._touchEventNames = [];
    		this._nLastScaleMultiply = 1.0;
    		this._nTempMultiply = 1.0;
    		
    		//translate 할 이미지의 가상 좌표. 기준은 0,0 에서 시작하고 이동 시 음의 값을 가질 수 있다.
    		this._nTranslateX = 0;
    		this._nTranslateY = 0;
    		
    		this._nScaledWidth = 0;
    		this._nScaledHeight = 0;
    		
    		//이미지 Scale 적용 시 이미지의 left/top 과 화면 좌표와의 거리
    		//이 값은 실제 element 의 값이 아닌 계산을 위한 가상의 값이다.
    		//아래 값이 음수인 경우 확대, 양수인 경우 축소된 경우
    		this._nDistanceXFromOrigin = 0;
    		this._nDistanceYFromOrigin = 0;
    		
    		this._hasTouchEvent = 'ontouchstart' in window;
    		
    		//사용자가 touch 했을 때 좌표 변경을 했는지를 체크하는 변수
    		//이동하지 않고 단순 Touch 만 했을 경우(Tab)에 커스텀 이벤트를 발생시키기 위해 사용하는 플래그 값 
    		this._bImageChangedAfterTouch = false;
    		
    		/*this.option({
    			nMaxScale : 4.0,
    		});*/
    	},
    	
    	_attachEvent : function() {
    		if (this._hasTouchEvent) {
    			this._touchEventNames = {
    				"touchstart" : "touchstart",
    				"touchmove" : "touchmove",
    				"touchend" : "touchend",
    			};
    		} else {
    			this._touchEventNames = {
    				"touchstart" : "mousedown",
    				"touchmove" : "mousemove",
    				"touchend" : "mouseup",
    			};
    		}
    		
    		this._$el.on(this._touchEventNames["touchstart"], {"self": this}, this._onTouchStart);
    	},
    	

    	/**
    	 * @description 3d Trans 또는 Trans를 기기별로 적용
    	 * @private
    	 */
    	_setTrans : function() {
    		if( /iPhone|iPad|iPod/i.test(navigator.userAgent) ) {
    			this._sTransOpen = "3d(";
    			this._sTransEnd = ",0)";
    		} else {
    			this._sTransOpen = "(";
				this._sTransEnd = ")";
    		}
    	},
    	
    	/**
    	 * touch start 후 부터 touch move 중 touch 의 변화량을 기준으로 scale 값을 구함.
    	 * 
    	 * @param {Array} touches
    	 * @returns 
    	 */
    	_calcScale : function(touches) {
    		return this._getDistance(touches) / this._nStartDistance;
    	},
    	
    	/**
		 * Calculates the distance between two touch points
		 * 피타고라스 정리
		 * 
		 * @param {Array} touches
		 * @returns {Number} Returns the distance
		 */
		_getDistance: function(touches) {
			var touch1 = touches[0];
			var touch2 = touches[1];
			return Math.sqrt(Math.pow(Math.abs(touch2.clientX - touch1.clientX), 2) + Math.pow(Math.abs(touch2.clientY - touch1.clientY), 2));
		},
    	
    	_onTouchStart : function(e) {
    		var self = e.data.self;
    		var touches = e.originalEvent.touches;
    		
    		if (self._hasTouchEvent === false || touches.length === 1) {
    			self._prevTouchX = self._getTouchX(e);
    			self._prevTouchY = self._getTouchY(e);
    			//console.log("onTouchStart (" + self._prevTouchX + ", " + self._prevTouchY + ")");
    		} else if (touches.length == 2) {
    			// preventDefault 의 2가지 역할
    			//	1. Android : touchmove 이벤트가 한번만 발생하는 현상 방지 
    			//	2. iOS : PinchZoom 상태에서 기본 스크롤링을 방지
    			e.preventDefault();
    			
    			self._nStartDistance = self._getDistance(touches);
    			self._bPinching = true;
    			
    			//
    			var pinchMidX = Math.abs(touches[0].clientX + touches[1].clientX) >> 1,
    				pinchMidY = Math.abs(touches[0].clientY + touches[1].clientY) >> 1;
    			
    			//console.log("midX = "+pinchMidX + ", midY = "+ pinchMidY + ", lastMultiply:"+this._nLastScaleMultiply);
    			self._oTargetInfo = self._getPinchTargetInfo(pinchMidX, pinchMidY);
    		}
    		
    		//Move 혹은 Pinch 로 추정되는 경우에만 아래 이벤트 핸들러 등록
    		if (self._hasTouchEvent === false || touches.length <= 2) {
    			self._$el.on(self._touchEventNames["touchmove"], {"self": self}, self._onTouchMove);
    			self._$el.on(self._touchEventNames["touchend"], {"self": self}, self._onTouchEnd);
    		}
    		
    		//self._$el.find("span").text(0);
    	},
    	
    	/**
    	 * Scale 을 적용하기 전, 사용자가 Pinch 하려는 대상 정보(좌표, 비율)를 반환한다.
    	 * 
    	 * 반환 정보: Pinch Zoom 대상(Target)
    	 *   1. 이미지에서의 x, y 좌표
    	 *   2. 해당 좌표가 이미지에서 위치하는 비율값
    	 * 
    	 * @param {Number} x 사용자가 Pinch 하고 있는 부분의 화면 좌표
    	 * @param {Number} y 사용자가 Pinch 하고 있는 부분의 화면 좌표
    	 */
    	_getPinchTargetInfo : function(x, y) {
    		// 1. 원본 이미지의 좌표를 구한다.(by scrollLeft, scrollTop, clientWidth, clientHeight)
    		//console.log("_getPinchTargetInfo: Before Scale Image("+this._elImageDiv.offsetLeft+", "+this._elImageDiv.offsetTop+", "+ this._elImageDiv.clientWidth + ", " +this._elImageDiv.clientHeight+", "+this._nTranslateX +", "+this._nTranslateY +")");
    		// 2. 원본 이미지의 Scale 된 크기와 가상 원점을 구한다.
    		var el = this._$el.get(0);
    		var w = el.clientWidth * this._nLastScaleMultiply, 
    			h = el.clientHeight * this._nLastScaleMultiply,
    			nStartX = -((w - el.clientWidth) >> 1) + el.offsetLeft + this._nTranslateX,
    			nStartY = -((h - el.clientHeight) >> 1) + el.offsetTop + this._nTranslateY;/*TODO: scrollTop 이냐 offsetTop 이냐???*/
    		//console.log("getPinchTargetInfo :" + w +", "+h +", nStartX:" + nStartX +", nStartY:"+nStartY);
    		//3. target 좌표가 이미지 영역에 포함되는지 체크
    		if (x >= nStartX && x <= (nStartX + w) && y >= nStartY && y <= (nStartY + h)) {
    			//target 이 영영 안
    			//4. 이미지 안에서 어느정도 위치에 있는지 pixel 로 구함.
    			var nDistX = x - nStartX,
    				nDistY = y - nStartY;
    			
    			var nRatioX = nDistX / w,
    				nRatioY = nDistY / h;
    			
    			//console.log("nRatioX : "+ nRatioX + ", nRatioY : "+ nRatioY);
    			var htPinchTargetInfo = {
    				nWidth : w, 
    				nHeight : h, 
    				nPosX : nDistX, 
    				nPosY :nDistY, 
    				nRatioX : nRatioX, 
    				nRatioY :nRatioY
    			};
    			
    			return htPinchTargetInfo;
    		} else {
    			//Target 이 영역 밖
    			return null;
    		}
    	},
    	
    	_onTouchMove : function(e) {
    		var self = e.data.self;
    		e.preventDefault();
    		var touches = e.originalEvent.touches;
    		if (self._hasTouchEvent == false || touches.length === 1) {
    			self._movePosition(self._getTouchX(e), self._getTouchY(e));
    		} else if (touches.length == 2){
    			//console.log("touch move : clientX=" + touches[0].clientX);
				var nScale = self._calcScale(touches);
    			//self._$el.find("div.touch span").text(nScale);
    			
    			//최종 스케일을 인자로 전달(event.scale 은 이전 스케일 값을 기준으로 변화된 양)
    			self._doScaleWhileKeepingFocus(nScale * self._nLastScaleMultiply);
    		}
    	},
    	
    	_getTouchX : function(e) {
    		return this._hasTouchEvent? e.originalEvent.touches[0].clientX : e.originalEvent.clientX;
    	},
    	
    	_getTouchY : function(e) {
    		return this._hasTouchEvent? e.originalEvent.touches[0].clientY : e.originalEvent.clientY;
    	},
    	
    	_movePosition : function(touchX, touchY) {
    		var nLeftDelta = touchX - this._prevTouchX,
    			nTopDelta = touchY - this._prevTouchY;
    		//console.log("movePosition touch x:" + touchX + ", y:" + touchY + ", prevX:" + this._prevTouchX + ", prevY:" + this._prevTouchY);
    		//console.log("translate x:" + this._nTranslateX + ", distance from origin:" + this._nDistanceXFromOrigin);
    		//이미지의 좌우 X 좌표값이 화면 영역 안에 포함되면 움직일 필요가 없음
    		/*if (this._nTranslateX > this._nDistanceXFromOrigin && ((this._nTranslateX - this._nDistanceXFromOrigin) + this._nScaledWidth) < window.innerWidth) {
    			console.log("X axis must not be moved!");
    			nLeftDelta = 0;
    		}*/
    		
    		//이미지의 상하 Y 좌표값이 화면 영역 안에 포함되면 움직일 필요가 없음
    		/*if (this._nTranslateY > this._nDistanceYFromOrigin && ((this._nTranslateY - this._nDistanceYFromOrigin) + this._nScaledHeight) < window.innerHeight) {
    			console.log("Y axis must not be moved!");
    			nTopDelta = 0;
    		}*/
    		var nNewLeft = (this._nTranslateX) + nLeftDelta,
    			nNewTop = (this._nTranslateY) + nTopDelta;
    		//console.log("movePostion: "+ nNewLeft + ",  " + nNewTop + " from ("+this._nTranslateX+", "+this._nTranslateY+")");
    		this._applyWebkitTransform(nNewLeft, nNewTop, this._nLastScaleMultiply);
    		
    		this._nTranslateX = nNewLeft;
    		this._nTranslateY = nNewTop;
    		
    		this._prevTouchX = touchX;
    		this._prevTouchY = touchY; 
    	},
    	
    	_applyWebkitTransform : function(nX, nY, nScale, nDuration) {
    		var el = this._$el.get(0);
    		el.style.webkitTransitionDuration = nDuration || "0ms";
    		el.style.webkitTransform = 'translate' + this._sTransOpen + nX + 'px, ' + nY + 'px' + this._sTransEnd + 'scale(' + nScale + ') ';
    		
    		this._bImageChangedAfterTouch = true;
    	},
    	
    	_onTouchEnd : function(e) {
    		var self = e.data.self;
    		//console.log("Touch End at(" + self.debug.index + ")");
    		self._$el.off(self._touchEventNames["touchmove"], self._onTouchMove);
			self._$el.off(self._touchEventNames["touchend"], self._onTouchEnd);
    		
			self._endScale();
			
    		self._$el.find("span").text(0);
    		self._bPinching = false;
    	},
    	
    	_endScale : function() {
    		var el = this._$el.get(0);
    		//this._nLastScaleMultiply = event.scale; // 경우에 따라 event.scale 값이 1.0 기준의 값으로 전달되는 경우가 있음.
    		if (this._nTempMultiply <= nMinMultiply) {
    			this._nLastScaleMultiply = nMinMultiply;
    			this._nTempMultiply = nMinMultiply;
    			el.style.webkitTransform = 'scale(' + nMinMultiply + ')';
    			
    			this._nTranslateX = 0;
    			this._nTranslateY = 0;
    			this._nDistanceXFromOrigin = 0;
    			this._nDistanceYFromOrigin = 0;
    		} else {
    			var nMaxScale = 4.0;//this.option('nMaxScale');
    			if (this._nTempMultiply > nMaxScale) {
    				this._nLastScaleMultiply = nMaxScale;
    				this._nTempMultiply = nMaxScale;
    				
    				this._doScaleWhileKeepingFocus(this._nLastScaleMultiply);
    			}
    			
    			var offset = this._getCssOffset(el);
    			
    			this._nTranslateX = offset.left;
    			this._nTranslateY = offset.top;
    			
    			this._calcDistanceFromOrigin();
    			this._nLastScaleMultiply = this._nTempMultiply;
    		}
    		//targetInfo 정보는 다음 제스쳐 동작시에는 필요없으므로,
    		//초기화 해주어야 제스쳐 동작시 잘못된 참조를 하지 않는다.
    		this._oTargetInfo = null;
    		//console.log("gesture end : scale = " + this._nLastScaleMultiply);
    		//this.fireEvent("afterPinch", {nScale:this._nLastScaleMultiply});
    	},
    	
    	_getCssOffset : function(element){
    		var curTransform  = new WebKitCSSMatrix(window.getComputedStyle(element).webkitTransform);
    			return {
    				top : curTransform.m42,
    				left: curTransform.m41
    		};
    	},
    	
    	/**
    	 * @description 확대된 이미지의 원점으로부터 화면 상의 원점으로 이동하기 위한 거리를 구한다.
    	 * @private
    	 * 
    	 */
    	_calcDistanceFromOrigin : function() {
    		var el = this._$el.get(0);
    		var width = this._pxToNum(el.style.width),
    			height = this._pxToNum(el.style.height);
    		var nScaledWidthHalf = (this._nScaledWidth - width) >> 1,
    			nScaledHeightHalf = (this._nScaledHeight - height) >> 1;
    		
    		//console.log("_calcDistanceFromOrigin: original w, h(" + width + ", "+height+") scaled w,h("+this._nScaledWidth+", "+this._nScaledHeight+")");
    		//console.log("calc distance - left:"+ this._elImageDiv.style.left+", top:"+this._elImageDiv.style.top);
    		this._nDistanceXFromOrigin = nScaledWidthHalf - this._pxToNum(el.style.left);
    		this._nDistanceYFromOrigin = nScaledHeightHalf - this._pxToNum(el.style.top);
    		//console.log("distance from origin = (" + this._nDistanceXFromOrigin + ", "+this._nDistanceYFromOrigin+")");
    	},
    	
    	_pxToNum : function(sSize) {
    		var s = sSize.replace("px","");
    		return s * 1;
    	},
    	
    	/**
    	 * 인자로 주어진 scale 값으로 (핀치 포커스를 유지하면서) 이미지를 Scaling 한다.
    	 * 
    	 * @param 
    	 */
    	_doScaleWhileKeepingFocus : function(nScale) {
    		if (this._oTargetInfo == null) {
    			//Pre-condition: 이 함수가 호출되기 전에는 반드시 targetInfo 가 구해져야 한다.
    			console.log("this._oTargetInfo is null");
    			return;
    		}
    		
    		var el = this._$el.get(0);
    		this._nScaledWidth = el.clientWidth * nScale,
    		this._nScaledHeight = el.clientHeight * nScale;
    		
    		//스케일 될 이미지에서 focus 될 부분의 위치에 대해 이미지 중앙으로부터의 거리를 구한다.
    		var nDstX = (this._nScaledWidth * this._oTargetInfo.nRatioX) - (this._nScaledWidth >> 1),
    			nDstY = (this._nScaledHeight * this._oTargetInfo.nRatioY) - (this._nScaledHeight >> 1),
    		
    		//스케일 되기전 focus 영영의 중앙으로부터의 거리를 빼서 focus 될 위치를 유지시키기 위한 변위를 구한다.
    			nDispX = nDstX - (this._oTargetInfo.nPosX - (this._oTargetInfo.nWidth >> 1)),
    			nDispY = nDstY - (this._oTargetInfo.nPosY - (this._oTargetInfo.nHeight >> 1));
    		
    		//변위를 적용한 최종 좌표
    		var dx = this._nTranslateX - nDispX, 
    			dy = this._nTranslateY - nDispY;
    		
    		this._applyWebkitTransform(dx, dy, nScale);
    		//console.log("scale change : " + 'translate(' + dx + 'px, ' + dy + 'px)' + ' scale(' + nScale + ')');
    		this._nTempMultiply = nScale; 
    	},
    	
    	_onGestureChange : function(e) {
    		var self = e.data.self;
    		//console.log(self);
    		//console.log("Touch End at(" + self.debug.index + ")");
    		//console.log(e);
    		self._$el.find("div.gesture span").text(e.originalEvent.scale);
    	},
    	
    	option : function(htOption) {
    		
    	},
    	
    	/**
    	 * @description 화면 중앙부를 중심으로 이미지를 확대한다.
    	 * @public
    	 * 
    	 * @param {Number} nScale 적용할 확대 비율 1.0 보다 큰 경우 확대. 1.0 보다 작은 경우 축소
    	 */
    	zoom : function(nScale) {
    		var offset = this._$el.offset();
    		var nTargetX = offset.left + (this._$el.width() >> 1),
    			nTargetY = offset.top + (this._$el.height() >> 1);
    			
    		this._oTargetInfo = this._getPinchTargetInfo(nTargetX, nTargetY);
    		this._doScaleWhileKeepingFocus(nScale);
    		this._endScale();
    	}
    };
    
})(jQuery);