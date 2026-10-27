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
  range?: { from: number; to?: number },
) => { d: string; mode: 'fill' | 'stroke'; width: number; opacity: number; stable?: number };

/**
 * Правка для Черты: длинная черта рисуется кусками. Устоявшееся начало черты «замораживается» отдельным путём,
 * а при каждом движении меняется только короткий живой конец. Иначе телефон на каждом кадре заново
 * растеризует прямоугольник вокруг всей черты — у длинной диагонали это почти вся клетка (задержка и рывки).
 */
const CHUNK = 160;

let painter: StrokePainter | null = null;
export function setStrokePainter(p: StrokePainter | null) {
  painter = p;
}

export default class UserStrokeRenderer {
  _oldProps: UserStrokeProps | undefined = undefined;
  _group: SVGElement | undefined;
  _path: SVGElement | undefined;
  _frozen: SVGElement[] = [];
  _frozenLen = 0;
  _style: Record<string, string> = {};

  mount(target: SVGRenderTarget) {
    this._group = svg.createElm('g');
    this._path = svg.createElm('path');
    this._group.appendChild(this._path);
    target.svg.appendChild(this._group);
  }

  _resetFrozen() {
    for (const el of this._frozen) svg.removeElm(el);
    this._frozen = [];
    this._frozenLen = 0;
  }

  render(props: UserStrokeProps) {
    if (!this._path || !this._group || props === this._oldProps) {
      return;
    }
    const styleChanged =
      props.strokeColor !== this._oldProps?.strokeColor || props.strokeWidth !== this._oldProps?.strokeWidth;
    const geometryChanged = styleChanged || props.points !== this._oldProps?.points;
    if (geometryChanged) {
      const { r, g, b, a } = props.strokeColor;
      const color = `rgba(${r},${g},${b},${a})`;
      if (styleChanged || !painter) this._resetFrozen();
      let shape = painter
        ? painter(props.points, props.strokeWidth, this._frozenLen ? { from: this._frozenLen } : undefined)
        : { d: getPathString(props.points), mode: 'stroke' as const, width: props.strokeWidth, opacity: 1, stable: 0 };
      const style = {
        fill: shape.mode === 'fill' ? color : 'none',
        stroke: shape.mode === 'stroke' ? color : 'none',
        'stroke-width': shape.width.toString(),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'fill-opacity': shape.opacity.toString(),
        'stroke-opacity': shape.opacity.toString(),
      };
      if (styleChanged) for (const el of this._frozen) svg.attrs(el, style);
      this._style = style;
      // устоявшийся кусок — в отдельный неподвижный путь
      const stable = shape.stable ?? 0;
      if (painter && stable - this._frozenLen >= CHUNK) {
        const piece = svg.createElm('path');
        svg.attrs(piece, { ...style, d: painter(props.points, props.strokeWidth, { from: this._frozenLen, to: stable }).d });
        this._group.insertBefore(piece, this._path);
        this._frozen.push(piece);
        this._frozenLen = stable;
        shape = painter(props.points, props.strokeWidth, { from: this._frozenLen });
      } else if (painter && this._frozenLen > stable + 1) {
        // черта стала короче, чем замороженное (не должно быть) — рисуем заново целиком
        this._resetFrozen();
        shape = painter(props.points, props.strokeWidth);
      }
      svg.attrs(this._path, { ...style, d: shape.d });
    }
    if (props.opacity !== this._oldProps?.opacity) {
      svg.attr(this._group, 'opacity', props.opacity.toString());
    }
    this._oldProps = props;
  }

  destroy() {
    svg.removeElm(this._group);
  }
}
