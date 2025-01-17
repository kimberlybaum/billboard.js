/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 */
import {
	mouse as d3Mouse,
	select as d3Select,
	event as d3Event
} from "d3-selection";
import {drag as d3Drag} from "d3-drag";
import ChartInternal from "../internals/ChartInternal";
import {document} from "../internals/browser";
import CLASS from "../config/classes";
import {emulateEvent, extend, isBoolean, isNumber, isObject} from "../internals/util";

extend(ChartInternal.prototype, {
	/**
	 * Initialize the area that detects the event.
	 * Add a container for the zone that detects the event.
	 * @private
	 */
	initEventRect() {
		const $$ = this;

		$$.main.select(`.${CLASS.chart}`)
			.append("g")
			.attr("class", CLASS.eventRects)
			.style("fill-opacity", "0");
	},

	/**
	 * Redraws the area that detects the event.
	 * @private
	 */
	redrawEventRect() {
		const $$ = this;
		const config = $$.config;
		const isMultipleX = $$.isMultipleX();
		let eventRectUpdate;

		const zoomEnabled = config.zoom_enabled;
		const eventRects = $$.main.select(`.${CLASS.eventRects}`)
			.style("cursor", zoomEnabled && zoomEnabled.type !== "drag" ? (
				config.axis_rotated ? "ns-resize" : "ew-resize"
			) : null)
			.classed(CLASS.eventRectsMultiple, isMultipleX)
			.classed(CLASS.eventRectsSingle, !isMultipleX);

		// clear old rects
		eventRects.selectAll(`.${CLASS.eventRect}`).remove();

		// open as public constiable
		$$.eventRect = eventRects.selectAll(`.${CLASS.eventRect}`);

		if (isMultipleX) {
			eventRectUpdate = $$.eventRect.data([0]);
			// update
			// enter: only one rect will be added
			// exit: not needed because always only one rect exists
			eventRectUpdate = $$.generateEventRectsForMultipleXs(eventRectUpdate.enter())
				.merge(eventRectUpdate);
		} else {
			// Set data and update $$.eventRect
			const xAxisTickValues = $$.flowing ?
				$$.getMaxDataCountTarget($$.data.targets).values :
				($$.axis.getTickValues("x") || []).map((x, index) => ({x, index}));

			eventRects.datum(xAxisTickValues);

			$$.eventRect = eventRects.selectAll(`.${CLASS.eventRect}`);
			eventRectUpdate = $$.eventRect.data(d => d);

			// exit
			eventRectUpdate.exit().remove();

			// update
			eventRectUpdate = $$.generateEventRectsForSingleX(eventRectUpdate.enter())
				.merge(eventRectUpdate);
		}

		$$.updateEventRect(eventRectUpdate);

		if ($$.inputType === "touch" && !$$.svg.on("touchstart.eventRect") && !$$.hasArcType()) {
			$$.bindTouchOnEventRect(isMultipleX);
		}
	},

	bindTouchOnEventRect(isMultipleX) {
		const $$ = this;
		const config = $$.config;

		const getEventRect = () => {
			const touch = d3Event.changedTouches[0];

			return d3Select(document.elementFromPoint(touch.clientX, touch.clientY));
		};

		const getIndex = eventRect => {
			let index = eventRect && eventRect.attr("class") && eventRect.attr("class")
				.replace(new RegExp(`(${CLASS.eventRect}-?|s)`, "g"), "") * 1;

			if (isNaN(index) || index === null) {
				index = -1;
			}

			return index;
		};

		const selectRect = context => {
			if (isMultipleX) {
				$$.selectRectForMultipleXs(context);
			} else {
				const eventRect = getEventRect();
				const index = getIndex(eventRect);

				$$.callOverOutForTouch(index);

				index === -1 ?
					$$.unselectRect() :
					$$.selectRectForSingle(context, eventRect, index);
			}
		};

		// call event.preventDefault()
		// according 'interaction.inputType.touch.preventDefault' option
		const preventDefault = config.interaction_inputType_touch.preventDefault;
		const isPrevented = (isBoolean(preventDefault) && preventDefault) || false;
		const preventThreshold = (!isNaN(preventDefault) && preventDefault) || null;
		let startPx;

		const preventEvent = event => {
			const eventType = event.type;
			const touch = event.changedTouches[0];
			const currentXY = touch[`client${config.axis_rotated ? "Y" : "X"}`];

			// prevent document scrolling
			if (eventType === "touchstart") {
				if (isPrevented) {
					event.preventDefault();
				} else if (preventThreshold !== null) {
					startPx = currentXY;
				}
			} else if (eventType === "touchmove") {
				if (isPrevented || startPx === true || (
					preventThreshold !== null && Math.abs(startPx - currentXY) >= preventThreshold
				)) {
					// once prevented, keep prevented during whole 'touchmove' context
					startPx = true;
					event.preventDefault();
				}
			}
		};

		// bind touch events
		$$.svg
			.on("touchstart.eventRect touchmove.eventRect", function() {
				const eventRect = getEventRect();

				if (!eventRect.empty() && eventRect.classed(CLASS.eventRect)) {
					if ($$.dragging || $$.flowing || $$.hasArcType()) {
						return;
					}

					preventEvent(d3Event);
					selectRect(this);
				} else {
					$$.unselectRect();
					$$.callOverOutForTouch();
				}
			})
			.on("touchend.eventRect", () => {
				const eventRect = getEventRect();

				if (!eventRect.empty() && eventRect.classed(CLASS.eventRect)) {
					if ($$.hasArcType() || !$$.toggleShape || $$.cancelClick) {
						$$.cancelClick && ($$.cancelClick = false);
					}
				}
			});
	},

	/**
	 * Updates the location and size of the eventRect.
	 * @private
	 * @param {Object} d3.select(CLASS.eventRects) object.
	 */
	updateEventRect(eventRectUpdate) {
		const $$ = this;
		const config = $$.config;
		const xScale = $$.zoomScale || $$.x;
		const eventRectData = eventRectUpdate || $$.eventRect.data();// set update selection if null
		const isRotated = config.axis_rotated;
		let x;
		let y;
		let w;
		let h;

		if ($$.isMultipleX()) {
			// TODO: rotated not supported yet
			x = 0;
			y = 0;
			w = $$.width;
			h = $$.height;
		} else {
			let rectW;
			let rectX;

			if ($$.isCategorized()) {
				rectW = $$.getEventRectWidth();
				rectX = d => xScale(d.x) - (rectW / 2);
			} else {
				// update index for x that is used by prevX and nextX
				$$.updateXs();

				const getPrevNextX = d => {
					const index = d.index;

					return {
						prev: $$.getPrevX(index),
						next: $$.getNextX(index)
					};
				};

				rectW = d => {
					const x = getPrevNextX(d);

					// if there this is a single data point make the eventRect full width (or height)
					if (x.prev === null && x.next === null) {
						return isRotated ? $$.height : $$.width;
					}

					if (x.prev === null) {
						x.prev = xScale.domain()[0];
					}

					if (x.next === null) {
						x.next = xScale.domain()[1];
					}

					return Math.max(0, (xScale(x.next) - xScale(x.prev)) / 2);
				};

				rectX = d => {
					const x = getPrevNextX(d);
					const thisX = d.x;

					// if there this is a single data point position the eventRect at 0
					if (x.prev === null && x.next === null) {
						return 0;
					}

					if (x.prev === null) {
						x.prev = xScale.domain()[0];
					}

					return (xScale(thisX) + xScale(x.prev)) / 2;
				};
			}

			x = isRotated ? 0 : rectX;
			y = isRotated ? rectX : 0;
			w = isRotated ? $$.width : rectW;
			h = isRotated ? rectW : $$.height;
		}

		eventRectData.attr("class", $$.classEvent.bind($$))
			.attr("x", x)
			.attr("y", y)
			.attr("width", w)
			.attr("height", h);
	},

	selectRectForSingle(context, eventRect, index) {
		const $$ = this;
		const config = $$.config;
		const isSelectionEnabled = config.data_selection_enabled;
		const isSelectionGrouped = config.data_selection_grouped;
		const isTooltipGrouped = config.tooltip_grouped;
		const selectedData = $$.getAllValuesOnIndex(index);

		if (isTooltipGrouped) {
			$$.showTooltip(selectedData, context);
			$$.showXGridFocus(selectedData);

			if (!isSelectionEnabled || isSelectionGrouped) {
				return;
			}
		}

		$$.main.selectAll(`.${CLASS.shape}-${index}`)
			.each(function() {
				d3Select(this).classed(CLASS.EXPANDED, true);

				if (isSelectionEnabled) {
					eventRect.style("cursor", isSelectionGrouped ? "pointer" : null);
				}

				if (!isTooltipGrouped) {
					$$.hideXGridFocus();
					$$.hideTooltip();

					!isSelectionGrouped && $$.expandCirclesBars(index);
				}
			})
			.filter(function(d) {
				return $$.isWithinShape(this, d);
			})
			.call(selected => {
				const d = selected.data();

				if (isSelectionEnabled && (isSelectionGrouped || config.data_selection_isselectable(d))) {
					eventRect.style("cursor", "pointer");
				}

				if (!isTooltipGrouped) {
					$$.showTooltip(d, context);
					$$.showXGridFocus(d);

					$$.unexpandCircles();
					selected.each(d => $$.expandCirclesBars(index, d.id));
				}
			});
	},

	expandCirclesBars(index, id, reset) {
		const $$ = this;
		const config = $$.config;

		config.point_focus_expand_enabled &&
			$$.expandCircles(index, id, reset);

		$$.expandBars(index, id, reset);
	},

	selectRectForMultipleXs(context) {
		const $$ = this;
		const config = $$.config;
		const targetsToShow = $$.filterTargetsToShow($$.data.targets);

		// do nothing when dragging
		if ($$.dragging || $$.hasArcType(targetsToShow)) {
			return;
		}

		const mouse = d3Mouse(context);
		const closest = $$.findClosestFromTargets(targetsToShow, mouse);

		if ($$.mouseover && (!closest || closest.id !== $$.mouseover.id)) {
			config.data_onout.call($$.api, $$.mouseover);
			$$.mouseover = undefined;
		}

		if (!closest) {
			$$.unselectRect();
			return;
		}

		const sameXData = (
			$$.isBubbleType(closest) || $$.isScatterType(closest) || !config.tooltip_grouped
		) ? [closest] : $$.filterByX(targetsToShow, closest.x);

		// show tooltip when cursor is close to some point
		const selectedData = sameXData.map(d => $$.addName(d));

		$$.showTooltip(selectedData, context);

		// expand points
		$$.expandCirclesBars(closest.index, closest.id, true);

		// Show xgrid focus line
		$$.showXGridFocus(selectedData);

		// Show cursor as pointer if point is close to mouse position
		if ($$.isBarType(closest.id) || $$.dist(closest, mouse) < config.point_sensitivity) {
			$$.svg.select(`.${CLASS.eventRect}`).style("cursor", "pointer");

			if (!$$.mouseover) {
				config.data_onover.call($$.api, closest);
				$$.mouseover = closest;
			}
		}
	},

	/**
	 * Unselect EventRect.
	 * @private
	 */
	unselectRect() {
		const $$ = this;

		$$.svg.select(`.${CLASS.eventRect}`).style("cursor", null);
		$$.hideXGridFocus();
		$$.hideTooltip();
		$$._handleLinkedCharts(false);
		$$.unexpandCircles();
		$$.unexpandBars();
	},

	/**
	 * Handle data.onover/out callback options
	 * @param {Boolean} isOver
	 * @param {Number|Object} d
	 * @private
	 */
	setOverOut(isOver, d) {
		const $$ = this;
		const config = $$.config;
		const isArc = isObject(d);

		// Call event handler
		if (isArc || d !== -1) {
			const callback = config[isOver ? "data_onover" : "data_onout"].bind($$.api);

			config.color_onover && $$.setOverColor(isOver, d, isArc);

			if (isArc) {
				callback(d);
			} else {
				isOver && $$.expandCirclesBars(d, null, true);
				!$$.isMultipleX() && $$.main.selectAll(`.${CLASS.shape}-${d}`).each(callback);
			}
		}
	},

	/**
	 * Call data.onover/out callback for touch event
	 * @param {Number|Object} d target index or data object for Arc type
	 * @private
	 */
	callOverOutForTouch(d) {
		const $$ = this;
		const callee = $$.callOverOutForTouch;
		const last = callee.last;

		if (isObject(d) && last ? d.id !== last.id : (d !== last)) {
			(last || isNumber(last)) && $$.setOverOut(false, last);
			(d || isNumber(d)) && $$.setOverOut(true, d);

			callee.last = d;
		}
	},

	/**
	 * Return draggable selection function
	 * @return {Function}
	 * @private
	 */
	getDraggableSelection() {
		const $$ = this;
		const config = $$.config;

		return config.interaction_enabled && config.data_selection_draggable && $$.drag ?
			d3Drag()
				.on("drag", function() { $$.drag(d3Mouse(this)); })
				.on("start", function() { $$.dragstart(d3Mouse(this)); })
				.on("end", () => { $$.dragend(); }) : () => {};
	},

	/**
	 * Create eventRect for each data on the x-axis.
	 * Register touch and drag events.
	 * @private
	 * @param {Object} d3.select(CLASS.eventRects) object.
	 * @returns {Object} d3.select(CLASS.eventRects) object.
	 */
	generateEventRectsForSingleX(eventRectEnter) {
		const $$ = this;
		const config = $$.config;

		const rect = eventRectEnter.append("rect")
			.attr("class", $$.classEvent.bind($$))
			.style("cursor", config.data_selection_enabled && config.data_selection_grouped ? "pointer" : null)
			.on("click", function(d) {
				$$.clickHandlerForSingleX.bind(this)(d, $$);
			})
			.call($$.getDraggableSelection());

		if ($$.inputType === "mouse") {
			rect
				.on("mouseover", d => {
					// do nothing while dragging/flowing
					if ($$.dragging || $$.flowing || $$.hasArcType()) {
						return;
					}

					$$.setOverOut(true, d.index);
				})
				.on("mousemove", function(d) {
					// do nothing while dragging/flowing
					if ($$.dragging || $$.flowing || $$.hasArcType()) {
						return;
					}

					let index = d.index;
					const eventRect = $$.svg.select(`.${CLASS.eventRect}-${index}`);

					if ($$.isStepType(d) &&
						$$.config.line_step_type === "step-after" &&
						d3Mouse(this)[0] < $$.x($$.getXValue(d.id, index))
					) {
						index -= 1;
					}

					index === -1 ?
						$$.unselectRect() : $$.selectRectForSingle(this, eventRect, index);
				})
				.on("mouseout", d => {
					// chart is destroyed
					if (!$$.config || $$.hasArcType()) {
						return;
					}

					$$.unselectRect();
					$$.setOverOut(false, d.index);
				});
		}

		return rect;
	},

	clickHandlerForSingleX(d, ctx) {
		const $$ = ctx;
		const config = $$.config;

		if ($$.hasArcType() || !$$.toggleShape || $$.cancelClick) {
			$$.cancelClick && ($$.cancelClick = false);

			return;
		}

		const index = d.index;

		$$.main.selectAll(`.${CLASS.shape}-${index}`)
			.each(function(d2) {
				if (config.data_selection_grouped || $$.isWithinShape(this, d2)) {
					$$.toggleShape(this, d2, index);
					config.data_onclick.call($$.api, d2, this);
				}
			});
	},

	/**
	 * Create an eventRect,
	 * Register touch and drag events.
	 * @private
	 * @param {Object} d3.select(CLASS.eventRects) object.
	 * @returns {Object} d3.select(CLASS.eventRects) object.
	 */
	generateEventRectsForMultipleXs(eventRectEnter) {
		const $$ = this;

		const rect = eventRectEnter
			.append("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", $$.width)
			.attr("height", $$.height)
			.attr("class", CLASS.eventRect)
			.on("click", function() {
				$$.clickHandlerForMultipleXS.bind(this)($$);
			})
			.call($$.getDraggableSelection());

		if ($$.inputType === "mouse") {
			rect
				.on("mouseover mousemove", function() {
					$$.selectRectForMultipleXs(this);
				})
				.on("mouseout", () => {
					// chart is destroyed
					if (!$$.config || $$.hasArcType()) {
						return;
					}

					$$.unselectRect();
				});
		}

		return rect;
	},

	clickHandlerForMultipleXS(ctx) {
		const $$ = ctx;
		const config = $$.config;
		const targetsToShow = $$.filterTargetsToShow($$.data.targets);

		if ($$.hasArcType(targetsToShow)) {
			return;
		}

		const mouse = d3Mouse(this);
		const closest = $$.findClosestFromTargets(targetsToShow, mouse);

		if (!closest) {
			return;
		}

		// select if selection enabled
		if ($$.isBarType(closest.id) || $$.dist(closest, mouse) < config.point_sensitivity) {
			$$.main.selectAll(`.${CLASS.shapes}${$$.getTargetSelectorSuffix(closest.id)}`)
				.selectAll(`.${CLASS.shape}-${closest.index}`)
				.each(function() {
					if (config.data_selection_grouped || $$.isWithinShape(this, closest)) {
						$$.toggleShape(this, closest, closest.index);
						config.data_onclick.call($$.api, closest, this);
					}
				});
		}
	},

	/**
	 * Dispatch a mouse event.
	 * @private
	 * @param {String} type event type
	 * @param {Number} index Index of eventRect
	 * @param {Array} mouse x and y coordinate value
	 */
	dispatchEvent(type, index, mouse) {
		const $$ = this;
		const isMultipleX = $$.isMultipleX();
		const selector = `.${isMultipleX ? CLASS.eventRect : `${CLASS.eventRect}-${index}`}`;
		const eventRect = $$.main.select(selector).node();
		const {width, left, top} = eventRect.getBoundingClientRect();
		const x = left + (mouse ? mouse[0] : 0) + (isMultipleX ? 0 : (width / 2));
		const y = top + (mouse ? mouse[1] : 0);
		const params = {
			screenX: x,
			screenY: y,
			clientX: x,
			clientY: y
		};

		emulateEvent[/^(mouse|click)/.test(type) ? "mouse" : "touch"](eventRect, type, params);
	}
});
