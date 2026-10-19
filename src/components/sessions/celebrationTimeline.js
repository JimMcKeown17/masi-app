import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { duration, easing } from '../../constants/motion';

export const TIMELINE = {
  cardEnter: { delay: 0, duration: 300 },
  pillEnter: { delay: 0, duration: 200 },
  content: { delay: 0, duration: duration.fade },
  earned: { delay: 250, duration: 300 },
  flip: { delay: 650, duration: duration.fade },
  confettiLayer: { delay: 700, duration: 0 },
  confettiTravel: { delay: 700, duration: 300 },
  confettiFade: { delay: 1000, duration: 300 },
  headlineTarget: { delay: 800, duration: 300 },
  headlineOther: { delay: 100, duration: 300 },
  still: { delay: 0, duration: duration.fade },
};

function track(value, timing, curve = Easing.linear, useNativeDriver = true) {
  return Animated.sequence([
    Animated.delay(timing.delay),
    Animated.timing(value, { toValue: 1, duration: timing.duration, easing: curve, useNativeDriver }),
  ]);
}

export function useCelebrationTimeline({ view, goalStatus }) {
  const celebrateAtMount = useRef(view.celebrate).current;
  const [values] = useState(() => ({
    cardEnter: new Animated.Value(celebrateAtMount ? 0 : 1),
    pillEnter: new Animated.Value(celebrateAtMount ? 0 : 1),
    content: new Animated.Value(0),
    earned: new Animated.Value(0),
    flip: new Animated.Value(0),
    confettiLayer: new Animated.Value(0),
    confettiTravel: new Animated.Value(0),
    confettiFade: new Animated.Value(0),
    headline: new Animated.Value(0),
  }));
  const [settled, setSettled] = useState(false);
  const mounted = useRef(false);
  const started = useRef(false);
  const goalAnimation = useRef(null);

  useEffect(() => {
    mounted.current = true;
    const entrance = celebrateAtMount ? Animated.parallel([
      track(values.cardEnter, TIMELINE.cardEnter, easing.enter),
      track(values.pillEnter, TIMELINE.pillEnter, easing.enter),
    ]) : null;
    entrance?.start();

    return () => {
      // stop() invokes callbacks synchronously; fence them before cancellation.
      mounted.current = false;
      entrance?.stop();
      goalAnimation.current?.stop();
      started.current = false;
    };
  }, [celebrateAtMount, values]);

  useEffect(() => {
    if (goalStatus === 'loading' || started.current) return;
    started.current = true;
    const animatedGauge = view.celebrate && view.gauge?.mode === 'animated';
    const tracks = [track(values.content, view.celebrate ? TIMELINE.content : TIMELINE.still)];

    if (animatedGauge) {
      if (view.gauge.earned) {
        tracks.push(track(values.earned, TIMELINE.earned, easing.sweep, false));
      } else {
        values.earned.setValue(1);
      }
      tracks.push(track(values.flip, TIMELINE.flip, easing.enter));
      if (view.confetti) {
        tracks.push(
          track(values.confettiLayer, TIMELINE.confettiLayer),
          track(values.confettiTravel, TIMELINE.confettiTravel, easing.sweep),
          track(values.confettiFade, TIMELINE.confettiFade),
        );
      }
    } else {
      values.earned.setValue(1);
      values.flip.setValue(1);
    }

    const headlineTiming = !view.celebrate ? TIMELINE.still
      : animatedGauge && view.headlineMotion === 'target' ? TIMELINE.headlineTarget : TIMELINE.headlineOther;
    tracks.push(track(values.headline, headlineTiming, view.celebrate ? easing.enter : Easing.linear));
    goalAnimation.current = Animated.parallel(tracks);
    goalAnimation.current.start(({ finished }) => {
      if (finished && mounted.current) setSettled(true);
    });
    // Ownership stays with the mount effect: new view objects must not cancel
    // or replay a celebration already in progress.
  }, [goalStatus, view, values]);

  return { values, settled };
}
