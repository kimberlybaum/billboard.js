/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 */
import CLASS from "./classes";
import {isString} from "../../internals/util";
import {getCentroid} from "./util";

/**
 * Stanford diagram plugin element class
 * @class ColorScale
 * @param {Stanford} owner Stanford instance
 * @private
 */
export default class Elements {
	constructor(owner) {
		this.owner = owner;

		// MEMO: Avoid blocking eventRect
		const elements = owner.$$.main.select(".bb-chart")
			.append("g")
			.attr("class", CLASS.stanfordElements);

		elements.append("g").attr("class", CLASS.stanfordLines);
		elements.append("g").attr("class", CLASS.stanfordRegions);
	}

	updateStanfordLines(duration) {
		const $$ = this.owner.$$;
		const main = $$.main;
		const config = $$.config;
		const isRotated = config.axis_rotated;
		const xvCustom = this.xvCustom.bind($$);
		const yvCustom = this.yvCustom.bind($$);

		// Stanford-Lines
		const stanfordLine = main.select(`.${CLASS.stanfordLines}`)
			.style("shape-rendering", "geometricprecision")
			.selectAll(`.${CLASS.stanfordLine}`)
			.data(this.owner.config.lines);

		// exit
		stanfordLine.exit().transition()
			.duration(duration)
			.style("opacity", 0)
			.remove();

		// enter
		const stanfordLineEnter = stanfordLine.enter().append("g");

		stanfordLineEnter.append("line")
			.style("opacity", 0);

		stanfordLineEnter
			.merge(stanfordLine)
			.attr("class", d => CLASS.stanfordLine + (d.class ? ` ${d.class}` : ""))
			.select("line")
			.transition()
			.duration(duration)
			.attr("x1", d => (isRotated ? yvCustom(d, "y1") : xvCustom(d, "x1")))
			.attr("x2", d => (isRotated ? yvCustom(d, "y2") : xvCustom(d, "x2")))
			.attr("y1", d => (isRotated ? xvCustom(d, "x1") : yvCustom(d, "y1")))
			.attr("y2", d => (isRotated ? xvCustom(d, "x2") : yvCustom(d, "y2")))
			.transition()
			.style("opacity", 1);
	}

	updateStanfordRegions(duration) {
		const $$ = this.owner.$$;
		const main = $$.main;
		const config = $$.config;
		const isRotated = config.axis_rotated;
		const xvCustom = this.xvCustom.bind($$);
		const yvCustom = this.yvCustom.bind($$);
		const countPointsInRegion = this.owner.countEpochsInRegion.bind($$);

		// Stanford-Regions
		let stanfordRegion = main.select(`.${CLASS.stanfordRegions}`)
			.selectAll(`.${CLASS.stanfordRegion}`)
			.data(this.owner.config.regions);

		// exit
		stanfordRegion.exit().transition()
			.duration(duration)
			.style("opacity", 0)
			.remove();

		// enter
		const stanfordRegionEnter = stanfordRegion.enter().append("g");

		stanfordRegionEnter.append("polygon")
			.style("opacity", 0);

		stanfordRegionEnter.append("text")
			.attr("transform", isRotated ? "rotate(-90)" : "")
			.style("opacity", 0);

		stanfordRegion = stanfordRegionEnter.merge(stanfordRegion);

		// update
		stanfordRegion
			.attr("class", d => CLASS.stanfordRegion + (d.class ? ` ${d.class}` : ""))
			.select("polygon")
			.transition()
			.duration(duration)
			.attr("points", d => d.points.map(value => [
				isRotated ? yvCustom(value, "y") : xvCustom(value, "x"),
				isRotated ? xvCustom(value, "x") : yvCustom(value, "y")
			].join(",")).join(" "))
			.transition()
			.style("opacity", d => (d.opacity ? d.opacity : 0.2));

		stanfordRegion.select("text")
			.transition()
			.duration(duration)
			.attr("x", d => (isRotated ? yvCustom(getCentroid(d.points), "y") : xvCustom(getCentroid(d.points), "x")))
			.attr("y", d => (isRotated ? xvCustom(getCentroid(d.points), "x") : yvCustom(getCentroid(d.points), "y")))
			.text(d => {
				if (d.text) {
					const {value, percentage} = countPointsInRegion(d.points);

					return d.text(value, percentage);
				}

				return "";
			})
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "middle")
			.transition()
			.style("opacity", 1);
	}

	updateStanfordElements(duration = 0) {
		this.updateStanfordLines(duration);
		this.updateStanfordRegions(duration);
	}

	xvCustom(d, xyValue) {
		const $$ = this;
		let value = xyValue ? d[xyValue] : $$.getBaseValue(d);

		if ($$.isTimeSeries()) {
			value = $$.parseDate(value);
		} else if ($$.isCategorized() && isString(value)) {
			value = $$.config.axis_x_categories.indexOf(d.value);
		}

		return Math.ceil($$.x(value));
	}

	yvCustom(d, xyValue) {
		const $$ = this;
		const yScale = d.axis && d.axis === "y2" ? $$.y2 : $$.y;
		const value = xyValue ? d[xyValue] : $$.getBaseValue(d);

		return Math.ceil(yScale(value));
	}
}
