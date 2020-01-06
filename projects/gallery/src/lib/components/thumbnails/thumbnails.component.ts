import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { fromEvent, of, Subject, animationFrameScheduler } from 'rxjs';
import {
  debounceTime,
  map,
  repeat,
  switchMap,
  takeUntil,
  takeWhile
} from 'rxjs/operators';
import { GalleryItem } from '../../core/gallery-item';
import { Orientation } from '../../core/orientation';

@Component({
  selector: 'ngx-thumbnails',
  templateUrl: './thumbnails.component.html',
  styleUrls: ['./thumbnails.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailsComponent
  implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input()
  items: GalleryItem[] = [];

  @Input()
  selectedItem: number;

  @Input()
  @HostBinding('class')
  orientation: Orientation;

  @Input()
  arrows: boolean;

  @Input()
  arrowSlideTime: number;

  @Input()
  arrowSlideByLength: number;

  @Input()
  @HostBinding('class.scrollable')
  scroll: boolean;

  @Output()
  thumbClick = new EventEmitter<Event>();

  @Output()
  selection = new EventEmitter<GalleryItem>();

  @ViewChild('thumbs', { static: true })
  thumbsRef: ElementRef<HTMLElement>;

  vertical: boolean;
  showStartArrow = false;
  showEndArrow = false;

  private destroy$ = new Subject();
  private sliding$ = new Subject<number>();

  private get scrollKey(): string {
    return this.vertical ? 'scrollTop' : 'scrollLeft';
  }

  private get thumbContainerMainAxis(): number {
    return this.vertical
      ? this.elRef.nativeElement.offsetHeight
      : this.elRef.nativeElement.offsetWidth;
  }

  private get thumbListMainAxis(): number {
    return this.vertical
      ? this.thumbsRef.nativeElement.scrollHeight
      : this.thumbsRef.nativeElement.scrollWidth;
  }

  constructor(
    private cd: ChangeDetectorRef,
    private elRef: ElementRef<HTMLElement>
  ) {}

  ngOnChanges({ orientation, selectedItem }: SimpleChanges) {
    if (orientation && orientation.currentValue != null) {
      const newOrientation: Orientation = orientation.currentValue;
      this.vertical = newOrientation === 'left' || newOrientation === 'right';
    }
    if (selectedItem && selectedItem.currentValue != null) {
      const itemEl = this.thumbsRef.nativeElement
        .querySelectorAll('li')
        .item(selectedItem.currentValue);

      // TODO replace with custom smooth mechanism
      itemEl && itemEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  ngOnInit() {
    this.arrowSlideTime === undefined && (this.arrowSlideTime = 200);

    // NOTE: This stream requests animation frames in a periodical fashion so that it can update scroll position of thumbnails
    // before each paint. The scroll value is updated proportionally to the time elapsed since the animation's start.
    // The period of requested frames should match the display's refresh rate as recommended in W3C spec. Essentially, this stream
    // requests animation frames in the same way as recursive calls to requestAnimationFrame().
    this.sliding$
      .pipe(
        switchMap(totalScroll => {
          const negative = totalScroll < 0;
          totalScroll = Math.abs(totalScroll);

          const startTime = Date.now();
          let currentScroll = 0;

          return of(0, animationFrameScheduler).pipe(
            repeat(),
            map(_ => {
              const suggestedScroll = Math.ceil(
                ((Date.now() - startTime) / this.arrowSlideTime) * totalScroll
              );
              const frameScroll = Math.min(
                suggestedScroll - currentScroll,
                totalScroll - currentScroll
              );
              currentScroll = suggestedScroll;

              return negative ? -frameScroll : frameScroll;
            }),
            takeWhile(_ => currentScroll < totalScroll, true)
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(frameScroll => {
        this.thumbsRef.nativeElement[this.scrollKey] += frameScroll;
      });

    fromEvent(this.thumbsRef.nativeElement, 'scroll')
      .pipe(debounceTime(20), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.arrows) {
          this.updateArrows();
          this.cd.detectChanges();
        }
      });
    if (typeof window !== undefined) {
      fromEvent(window, 'resize')
        .pipe(debounceTime(100), takeUntil(this.destroy$))
        .subscribe(this.update);
    }
  }

  ngAfterViewInit() {
    // TODO don't do both, also don't do at all if scrolling is turned off
    this.thumbsRef.nativeElement.scrollTop = 0;
    this.thumbsRef.nativeElement.scrollLeft = 0;

    setTimeout(this.update);
  }

  ngOnDestroy() {
    this.destroy$.next(null);
    this.destroy$.complete();
  }

  arrowSlide(direction: number) {
    let delta: number;

    if (this.arrowSlideByLength) {
      delta = this.arrowSlideByLength;
    } else {
      // Note: Slide by the full height/width of the gallery
      // or by the overflow of the thumbnails - to prevent unnecessary requestAnimationFrame calls while trying to scroll
      // outside of the min/max scroll of the thumbnails
      delta = Math.min(
        this.thumbContainerMainAxis,
        this.thumbListMainAxis - this.thumbContainerMainAxis
      );
    }
    this.sliding$.next(delta * direction);
  }

  private update = () => {
    if (this.arrows) {
      this.updateArrows();
      this.cd.detectChanges();
    }
  };

  private updateArrows() {
    this.showStartArrow = this.thumbsRef.nativeElement[this.scrollKey] > 0;

    this.showEndArrow =
      this.thumbsRef.nativeElement[this.scrollKey] <
      this.thumbListMainAxis - this.thumbContainerMainAxis;
  }
}