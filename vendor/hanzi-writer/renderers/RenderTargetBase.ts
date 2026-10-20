import { Point } from '../typings/types';

type BoundEvent = {
  getPoint(): Point;
  /** Правка для Черты: все точки движения с прошлого события (промежуточные, getCoalescedEvents). */
  getPoints(): Point[];
  /** Правка для Черты: точки, предсказанные браузером на ближайшие миллисекунды (getPredictedEvents) — только для показа. */
  getPredicted(): Point[];
  preventDefault(): void;
};

/** Правка для Черты: pointer-события вместо mouse/touch, если браузер их поддерживает. */
const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

/** Generic render target */
export default class RenderTargetBase<
  TElement extends
    | HTMLElement
    | SVGElement
    | SVGSVGElement
    | HTMLCanvasElement = HTMLElement
> {
  node: TElement;
  /** Правка для Черты: какой указатель ведёт черту (второй палец игнорируется). */
  _pointerId: number | undefined;

  constructor(node: TElement) {
    this.node = node;
  }

  /*
   * Правка для Черты. Было: mousedown/touchstart и т. п. — браузер присылает одно событие на кадр, а промежуточные
   * точки быстрой черты пропадают (черта выходит ломаной). Теперь pointer-события: getCoalescedEvents даёт все точки
   * (на многих телефонах 120–240 в секунду), getPredictedEvents — куда палец сместится к показу кадра (линия не
   * «догоняет» палец). Нажим стилуса — из pointer.pressure. Прокрутку страницы во время письма запрещает
   * touch-action: none (ставится, пока идёт проверка, см. HanziWriter.quiz).
   */
  addPointerStartListener(callback: (arg: BoundEvent) => void) {
    if (hasPointer) {
      this.node.addEventListener('pointerdown', (evt) => {
        const e = evt as PointerEvent;
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        this._pointerId = e.pointerId;
        try {
          (this.node as Element).setPointerCapture(e.pointerId);
        } catch {
          /* необязательно */
        }
        callback(this._pointerEventify(e));
      });
      return;
    }
    this.node.addEventListener('mousedown', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this.node.addEventListener('touchstart', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerMoveListener(callback: (arg: BoundEvent) => void) {
    if (hasPointer) {
      this.node.addEventListener('pointermove', (evt) => {
        const e = evt as PointerEvent;
        if (e.pointerId !== this._pointerId) return;
        callback(this._pointerEventify(e));
      });
      return;
    }
    this.node.addEventListener('mousemove', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this.node.addEventListener('touchmove', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerEndListener(callback: () => void) {
    if (hasPointer) {
      const end = (evt: Event) => {
        if ((evt as PointerEvent).pointerId !== this._pointerId) return;
        this._pointerId = undefined;
        callback();
      };
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
      return;
    }
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
    // Правка для Черты: viewBox — чтобы поле можно было растянуть CSS (см. _cssScale)
    if (typeof SVGElement !== 'undefined' && this.node instanceof SVGElement) {
      this.node.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
  }

  _eventify<TEvent extends Event>(evt: TEvent, pointFunc: (event: TEvent) => Point): BoundEvent {
    return {
      getPoint: () => pointFunc.call(this, evt),
      getPoints: () => [pointFunc.call(this, evt)],
      getPredicted: () => [],
      preventDefault: () => evt.preventDefault(),
    };
  }

  /** Правка для Черты: точка из pointer-события; нажим — только у стилуса и у пальца, если устройство его меряет. */
  _pointerPoint(e: PointerEvent, left: number, top: number): Point {
    const p = e.pointerType === 'mouse' || !(e.pressure > 0) || (e.pointerType === 'touch' && e.pressure === 0.5) ? undefined : e.pressure;
    const k = this._cssScale();
    return { x: (e.clientX - left) * k, y: (e.clientY - top) * k, t: e.timeStamp, p };
  }

  /**
   * Правка для Черты: поле растягивается CSS по размеру клетки (поворот планшета, другое окно), а внутренние
   * координаты hanzi-writer остаются от исходной ширины — переводим экранные пиксели в них.
   */
  _cssScale(): number {
    const w = Number((this.node as Element).getAttribute?.('width'));
    const real = this.getBoundingClientRect().width;
    return w > 0 && real > 0 ? w / real : 1;
  }

  _pointerEventify(e: PointerEvent): BoundEvent {
    let rect: DOMRect | undefined;
    const box = () => (rect ??= this.getBoundingClientRect());
    return {
      getPoint: () => this._pointerPoint(e, box().left, box().top),
      getPoints: () => {
        const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        const src = list.length ? list : [e];
        return src.map((c) => this._pointerPoint(c, box().left, box().top));
      },
      getPredicted: () => {
        const list = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
        return list.map((c) => this._pointerPoint(c, box().left, box().top));
      },
      preventDefault: () => e.preventDefault(),
    };
  }

  _getMousePoint(evt: MouseEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const k = this._cssScale();
    const x = (evt.clientX - left) * k;
    const y = (evt.clientY - top) * k;
    return { x, y, t: evt.timeStamp };
  }

  _getTouchPoint(evt: TouchEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const touch = evt.touches[0];
    const k = this._cssScale();
    const x = (touch.clientX - left) * k;
    const y = (touch.clientY - top) * k;
    // force: нажим стилуса (0, если устройство его не сообщает)
    return { x, y, t: evt.timeStamp, p: touch.force || undefined };
  }
}
