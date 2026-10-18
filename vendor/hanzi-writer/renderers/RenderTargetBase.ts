import { Point } from '../typings/types';

type BoundEvent = {
  getPoint(): Point;
  preventDefault(): void;
};

/** Generic render target */
export default class RenderTargetBase<
  TElement extends
    | HTMLElement
    | SVGElement
    | SVGSVGElement
    | HTMLCanvasElement = HTMLElement
> {
  node: TElement;
  /** Нажим стилуса из pointer-событий (они приходят раньше mouse/touch). Правка для Черты. */
  _penPressure: number | undefined;

  constructor(node: TElement) {
    this.node = node;
    const track = (evt: Event) => {
      const e = evt as PointerEvent;
      this._penPressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : undefined;
    };
    this.node.addEventListener('pointerdown', track);
    this.node.addEventListener('pointermove', track);
  }

  addPointerStartListener(callback: (arg: BoundEvent) => void) {
    this.node.addEventListener('mousedown', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this.node.addEventListener('touchstart', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerMoveListener(callback: (arg: BoundEvent) => void) {
    this.node.addEventListener('mousemove', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this.node.addEventListener('touchmove', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerEndListener(callback: () => void) {
    // TODO: find a way to not need global listeners
    document.addEventListener('mouseup', callback);
    document.addEventListener('touchend', callback);
  }

  getBoundingClientRect() {
    return this.node.getBoundingClientRect();
  }

  updateDimensions(width: string | number, height: string | number) {
    this.node.setAttribute('width', `${width}`);
    this.node.setAttribute('height', `${height}`);
  }

  _eventify<TEvent extends Event>(evt: TEvent, pointFunc: (event: TEvent) => Point) {
    return {
      getPoint: () => pointFunc.call(this, evt),
      preventDefault: () => evt.preventDefault(),
    };
  }

  _getMousePoint(evt: MouseEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const x = evt.clientX - left;
    const y = evt.clientY - top;
    return { x, y, t: evt.timeStamp, p: this._penPressure };
  }

  _getTouchPoint(evt: TouchEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const touch = evt.touches[0];
    const x = touch.clientX - left;
    const y = touch.clientY - top;
    // force: нажим стилуса (0, если устройство его не сообщает)
    return { x, y, t: evt.timeStamp, p: this._penPressure ?? (touch.force || undefined) };
  }
}
