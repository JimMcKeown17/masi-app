import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const phase = Platform.OS === 'ios' ? 'Will' : 'Did';
    const show = Keyboard.addListener(`keyboard${phase}Show`, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(`keyboard${phase}Hide`, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
