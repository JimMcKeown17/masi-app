import { Easing } from 'react-native';

export const duration = { fade: 150, quick: 200, base: 250, sweep: 300 };
export const easing = { enter: Easing.bezier(0.2, 0.8, 0.2, 1), sweep: Easing.out(Easing.cubic) };
