import * as svg from './svgUtils';
import { getPathString } from '../../geometry';
import { ColorObject, Point } from '../../typings/types';
import SVGRenderTarget from './RenderTarget';

export type UserStrokeProps = {
  strokeWidth: number;
  strokeColor: ColorObject;
  opacity: number;
  points: Point[];
};

/**
 * Правка для Черты: внешний «художник» черты (перо: кисть, ручка…).
 * Возвращает путь и способ отрисовки: залитый контур или линия.
 */
export type StrokePainter = (
  points: Point[],
  width: number,
) => { d: string; mode: 'fill' | 'stroke'; width: number; opacity: number };

let painter: StrokePainter | null = null;
export function setStrokePainter(p: StrokePainter | null) {
  painter = p;
}

export default class UserStrokeRenderer {
  _oldProps: UserStrokeProps | undefined = undefined;
  _path: SVGElement | undefined;

  mount(target: SVGRenderTarget) {
    this._path = svg.createElm('path');
    target.svg.appendChild(this._path);
  }

  render(props: UserStrokeProps) {
    if (!this._path || props === this._oldProps) {
      return;
    }
    const geometryChanged =
      props.points !== this._oldProps?.points ||
      props.strokeColor !== this._oldProps?.strokeColor ||
      props.strokeWidth !== this._oldProps?.strokeWidth;
    if (geometryChanged) {
      const { r, g, b, a } = props.strokeColor;
      const color = `rgba(${r},${g},${b},${a})`;
      const shape = painter
        ? painter(props.points, props.strokeWidth)
        : { d: getPathString(props.points), mode: 'stroke' as const, width: props.strokeWidth, opacity: 1 };
      svg.attrs(this._path, {
        fill: shape.mode === 'fill' ? color : 'none',
        stroke: shape.mode === 'stroke' ? color : 'none',
        'stroke-width': shape.width.toString(),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'fill-opacity': shape.opacity.toString(),
        'stroke-opacity': shape.opacity.toString(),
        d: shape.d,
      });
    }
    if (props.opacity !== this._oldProps?.opacity) {
      svg.attr(this._path, 'opacity', props.opacity.toString());
    }
    this._oldProps = props;
  }

  destroy() {
    svg.removeElm(this._path);
  }
}
