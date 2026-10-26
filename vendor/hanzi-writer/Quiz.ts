import strokeMatches, { StrokeMatchResultMeta } from './strokeMatches';
import UserStroke from './models/UserStroke';
import Positioner from './Positioner';
import { counter, colorStringToVals, fixIndex } from './utils';
import * as quizActions from './quizActions';
import * as geometry from './geometry';
import * as characterActions from './characterActions';
import Character from './models/Character';
import { ParsedHanziWriterOptions, Point, StrokeData } from './typings/types';
import RenderState from './RenderState';
import Mutation, { GenericMutation } from './Mutation';

const getDrawnPath = (userStroke: UserStroke) => ({
  pathString: geometry.getPathString(userStroke.externalPoints),
  points: userStroke.points.map((point) => geometry.round(point)),
});

/**
 * Правка для Черты: оставлять верно написанную черту пользователя (как «raw squigs» в Skritter)
 * вместо того, чтобы стирать её и рисовать эталонную.
 */
let keepUserStrokes = false;
export function setKeepUserStrokes(on: boolean) {
  keepUserStrokes = on;
}

export default class Quiz {
  _character: Character;
  _renderState: RenderState;
  _isActive: boolean;
  _positioner: Positioner;

  /** Set on startQuiz */
  _options: ParsedHanziWriterOptions | undefined;
  _currentStrokeIndex = 0;
  _mistakesOnStroke = 0;
  _totalMistakes = 0;
  _userStroke: UserStroke | undefined;
  _userStrokesIds: Array<number> | undefined;
  /** Правка для Черты: id нарисованной черты для каждой принятой (null — эталонная, показанная подсказкой). */
  _doneIds: Array<number | null> = [];

  constructor(character: Character, renderState: RenderState, positioner: Positioner) {
    this._character = character;
    this._renderState = renderState;
    this._isActive = false;
    this._positioner = positioner;
  }

  startQuiz(options: ParsedHanziWriterOptions) {
    if (this._userStrokesIds) {
      this._renderState.run(
        quizActions.removeAllUserStrokes( this._userStrokesIds ),
      );
    }
    this._userStrokesIds = []
    this._doneIds = [];

    this._isActive = true;
    this._options = options;
    const startIndex = fixIndex(
      options.quizStartStrokeNum,
      this._character.strokes.length,
    );
    this._currentStrokeIndex = Math.min(startIndex, this._character.strokes.length - 1);
    this._mistakesOnStroke = 0;
    this._totalMistakes = 0;

    return this._renderState.run(
      quizActions.startQuiz(
        this._character,
        options.strokeFadeDuration,
        this._currentStrokeIndex,
      ),
    );
  }

  startUserStroke(externalPoint: Point) {
    if (!this._isActive) {
      return null;
    }
    if (this._userStroke) {
      return this.endUserStroke();
    }
    const point = this._positioner.convertExternalPoint(externalPoint);
    const strokeId = counter();
    this._userStroke = new UserStroke(strokeId, point, externalPoint);
    this._userStrokesIds?.push(strokeId)
    return this._renderState.run(quizActions.startUserStroke(strokeId, point));
  }

  /**
   * Правка для Черты: принимает сразу несколько точек (промежуточные точки pointer-события) и предсказанные точки.
   * Предсказанные только рисуются в конце линии — в саму черту (и в проверку) не попадают.
   */
  continueUserStroke(externalPoint: Point | Point[], predicted: Point[] = []) {
    if (!this._userStroke) {
      return Promise.resolve();
    }
    for (const ext of Array.isArray(externalPoint) ? externalPoint : [externalPoint]) {
      this._userStroke.appendPoint(this._positioner.convertExternalPoint(ext), ext);
    }
    const nextPoints = this._userStroke.points.slice(0);
    const last = nextPoints[nextPoints.length - 1];
    for (const ext of predicted.slice(0, 3)) {
      const p = this._positioner.convertExternalPoint(ext);
      // не дальше ~4% клетки от последней точки: прогноз на резком повороте может промахнуться
      if (Math.hypot(p.x - last.x, p.y - last.y) > 40) break;
      nextPoints.push(p);
    }
    return this._renderState.run(
      quizActions.updateUserStroke(this._userStroke.id, nextPoints),
    );
  }

  setPositioner(positioner: Positioner) {
    this._positioner = positioner;
  }

  endUserStroke() {
    if (!this._userStroke) return;
    // Правка для Черты: убрать с экрана предсказанный хвост — остаётся ровно то, что нарисовано
    this._renderState.run(quizActions.updateUserStroke(this._userStroke.id, this._userStroke.points.slice(0)));

    const hide = () =>
      this._renderState.run(
        quizActions.hideUserStroke(
          this._userStroke!.id,
          this._options!.drawingFadeDuration ?? 300,
        ),
      );

    // skip single-point strokes
    if (this._userStroke.points.length === 1) {
      hide();
      this._userStroke = undefined;
      return;
    }

    const { acceptBackwardsStrokes, markStrokeCorrectAfterMisses } = this._options!;

    const currentStroke = this._getCurrentStroke();
    const { isMatch, meta } = strokeMatches(
      this._userStroke,
      this._character,
      this._currentStrokeIndex,
      {
        isOutlineVisible: this._renderState.state.character.outline.opacity > 0,
        leniency: this._options!.leniency,
        averageDistanceThreshold: this._options!.averageDistanceThreshold,
      },
    );

    // if markStrokeCorrectAfterMisses is passed, just force the stroke to count as correct after n tries
    const isForceAccepted =
      markStrokeCorrectAfterMisses &&
      this._mistakesOnStroke + 1 >= markStrokeCorrectAfterMisses;

    const isAccepted =
      isMatch || isForceAccepted || (meta.isStrokeBackwards && acceptBackwardsStrokes);

    if (isAccepted) {
      if (!keepUserStrokes) hide();
      this._handleSuccess(meta);
    } else {
      hide();
      this._handleFailure(meta);

      const {
        showHintAfterMisses,
        highlightColor,
        strokeHighlightSpeed,
      } = this._options!;

      if (
        showHintAfterMisses !== false &&
        this._mistakesOnStroke >= showHintAfterMisses
      ) {
        this._renderState.run(
          characterActions.highlightStroke(
            currentStroke,
            colorStringToVals(highlightColor),
            strokeHighlightSpeed,
          ),
        );
      }
    }

    this._userStroke = undefined;
  }

  /**
   * Правка для Черты: стереть последнюю принятую черту — проверка снова ждёт её.
   * Возвращает номер стёртой черты или -1 (нечего стирать, проверка закончена, идёт черта).
   */
  undoStroke(): number {
    if (!this._isActive || this._userStroke || this._currentStrokeIndex === 0) return -1;
    const idx = --this._currentStrokeIndex;
    this._mistakesOnStroke = 0;
    const id = this._doneIds.pop();
    const muts: GenericMutation[] = [
      new Mutation(`character.main.strokes.${idx}`, { opacity: 0 }, { force: true }),
      new Mutation(`character.highlight.strokes.${idx}`, { opacity: 0 }, { force: true }),
    ];
    if (id != null) muts.push(new Mutation(`userStrokes.${id}.opacity`, 0, { force: true }));
    this._renderState.run(muts);
    return idx;
  }

  cancel() {
    this._isActive = false;
    if (this._userStrokesIds) {
      this._renderState.run(
        quizActions.removeAllUserStrokes( this._userStrokesIds ),
      );
    }
  }

  _getStrokeData({
    isCorrect,
    meta,
  }: {
    isCorrect: boolean;
    meta: StrokeMatchResultMeta;
  }): StrokeData {
    return {
      character: this._character.symbol,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      strokesRemaining:
        this._character.strokes.length - this._currentStrokeIndex - (isCorrect ? 1 : 0),
      drawnPath: getDrawnPath(this._userStroke!),
      isBackwards: meta.isStrokeBackwards,
    };
  }

  nextStroke(drawnByUser = false) {
    if (!this._options) return;

    const { strokes, symbol } = this._character;

    const {
      onComplete,
      highlightOnComplete,
      strokeFadeDuration,
      highlightCompleteColor,
      highlightColor,
      strokeHighlightDuration,
    } = this._options;

    let animation: GenericMutation[] = keepUserStrokes && drawnByUser
      ? []
      : characterActions.showStroke('main', this._currentStrokeIndex, strokeFadeDuration);

    this._doneIds.push(drawnByUser && this._userStroke ? this._userStroke.id as number : null);
    this._mistakesOnStroke = 0;
    this._currentStrokeIndex += 1;

    const isComplete = this._currentStrokeIndex === strokes.length;

    if (isComplete) {
      this._isActive = false;
      onComplete?.({
        character: symbol,
        totalMistakes: this._totalMistakes,
      });
      if (highlightOnComplete) {
        animation = animation.concat(
          quizActions.highlightCompleteChar(
            this._character,
            colorStringToVals(highlightCompleteColor || highlightColor),
            (strokeHighlightDuration || 0) * 2,
          ),
        );
      }
    }

    this._renderState.run(animation);
  }

  _handleSuccess(meta: StrokeMatchResultMeta) {
    if (!this._options) return;

    const { onCorrectStroke } = this._options;

    onCorrectStroke?.({
      ...this._getStrokeData({ isCorrect: true, meta }),
    });

    this.nextStroke(true);
  }

  _handleFailure(meta: StrokeMatchResultMeta) {
    this._mistakesOnStroke += 1;
    this._totalMistakes += 1;
    this._options!.onMistake?.(this._getStrokeData({ isCorrect: false, meta }));
  }

  _getCurrentStroke() {
    return this._character.strokes[this._currentStrokeIndex];
  }
}
