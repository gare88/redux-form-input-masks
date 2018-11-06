import {
  applyMask,
  applyTransform,
  firstUnfilledPosition,
  inputReformat,
  isPatternComplete,
  maskStrip,
  charMatchTest,
  validCaretPositions,
} from './utils';
import defaultMaskDefinitions from './defaultMaskDefinitions';

export default options => {
  const {
    pattern,
    placeholder = '_',
    maskDefinitions = defaultMaskDefinitions,
    guide = true,
    stripMask = true,
    allowEmpty = false,
    onChange,
    onCompletePattern,
  } = options;

  if (!pattern) {
    throw new Error(
      'The key `pattern` is required for createTextMask.' +
        ' You probably forgot to add it to your options.',
    );
  }

  if (!placeholder || placeholder.length !== 1) {
    throw new Error(
      'The key `placeholder` should have a single character as a value.',
    );
  }

  const validPositions = validCaretPositions(pattern, maskDefinitions);

  // If there's no valid position for this pattern, throw an error
  if (validPositions.length === 0) {
    throw new Error(
      `The pattern \`${pattern}\` passed for createTextMask is not valid.`,
    );
  }

  const placeholderMatch = charMatchTest(placeholder, maskDefinitions);
  if (placeholderMatch) {
    throw new Error(
      `The placeholder \`${placeholder}\` matches the mask definition` +
        `\`${placeholderMatch}\`. The mask created using \`createTextMask\`` +
        'is therefore invalid.',
    );
  }

  const strippedPattern = maskStrip(
    pattern,
    pattern,
    placeholder,
    maskDefinitions,
  );

  const format = (storeValue, calledFromNormalize = false) => {
    if (!storeValue) {
      return applyMask(
        '',
        pattern,
        placeholder,
        guide,
        allowEmpty,
        maskDefinitions,
      );
    }

    if (!stripMask && !calledFromNormalize) {
      // If we aren't stripping the mask, the value should be already formatted
      return storeValue;
    }

    // Format the mask according to pattern and maskDefinitions
    return applyMask(
      storeValue,
      pattern,
      placeholder,
      guide,
      allowEmpty,
      maskDefinitions,
    );
  };

  const normalize = (updatedValue, previousValue) => {
    const inputHandledValue = inputReformat(
      updatedValue,
      pattern,
      placeholder,
      guide,
      allowEmpty,
      maskDefinitions,
    );

    // We need to strip the mask before working with it
    const strippedValue = maskStrip(
      inputHandledValue,
      pattern,
      placeholder,
      maskDefinitions,
    );

    // Apply the `transform` function on the inputted character
    const transformedValue = applyTransform(
      strippedValue,
      stripMask
        ? previousValue
        : maskStrip(previousValue, pattern, placeholder, maskDefinitions),
      strippedPattern,
      maskDefinitions,
    );
    const formattedValue = format(transformedValue, true);
    const newValue = stripMask ? transformedValue : formattedValue;
    const hasValueChanged =
      newValue !== previousValue &&
      (newValue !== '' || previousValue !== undefined);

    // We call `onChange` if it was set and if the value actually changed
    if (onChange && hasValueChanged) {
      onChange(newValue);
    }

    // We call `onCompletePattern` if it was set and the pattern is complete
    if (
      onCompletePattern &&
      isPatternComplete(formattedValue, pattern, maskDefinitions) &&
      hasValueChanged
    ) {
      /* setTimeout is used to avoid the function being called before rendering
      the last input from the user */
      setTimeout(() => onCompletePattern(newValue), 10);
    }

    // We need to reformat the string before storing
    return newValue;
  };

  const goToFirstUnfilledPosition = target => {
    const caretPos = firstUnfilledPosition(
      target.value,
      pattern,
      placeholder,
      maskDefinitions,
    );

    target.setSelectionRange(caretPos, caretPos);
  };

  const goToNearestValidPosition = (target, position, direction) => {
    /* `validPositions` is ordered from least to greatest, so we find the first
    valid positon after `position` */
    let nearestIndexToTheRight;
    for (let index = 0; index <= validPositions.length; index += 1) {
      const element = validPositions[index];
      if (element > position) {
        nearestIndexToTheRight = index;
        break;
      }
    }

    let caretPos;
    if (direction === 'left') {
      /* The nearest valid position to the left will be the element that comes
      before it. */
      caretPos = validPositions[nearestIndexToTheRight - 1];
    } else {
      caretPos = validPositions[nearestIndexToTheRight];
    }

    /* If there are no valid position to the informed direction we fallback to
    the first valid position (left) or to the last valid position (right) */
    if (caretPos === undefined) {
      const fallbackIndex =
        direction === 'left' ? 0 : validPositions.length - 1;
      caretPos = validPositions[fallbackIndex];
    }
    target.setSelectionRange(caretPos, caretPos);
  };

  const manageCaretPosition = event => {
    if (event.target) {
      if (event.persist) {
        event.persist();
      }

      // We get these values before updating
      const previousSelection = event.target.selectionStart;
      const previousValue = event.target.value;

      // This timeout is needed to get updated values
      setTimeout(() => {
        const { target, type, key } = event;
        const { value, selectionStart, selectionEnd } = event.target;

        switch (type) {
          case 'change':
            /* Upon change, we need to determine if the user has pressed
            backspace to move the caret accordingly */
            if (
              value.length === previousValue.length + 1 &&
              value.charAt(previousSelection) ===
                pattern.charAt(previousSelection)
            ) {
              // Backspace was pressed at a pattern char
              goToNearestValidPosition(target, previousSelection, 'left');
              break;
            }
            goToFirstUnfilledPosition(target);
            break;
          case 'focus':
            // Upon focus, we move to the first unfilled position
            goToFirstUnfilledPosition(target);
            break;
          case 'click':
            /* Upon click, we first check if the caret is on a valid position.
            If it isn't, we move it to the first unfilled position */
            if (selectionStart === selectionEnd) {
              if (validPositions.indexOf(selectionStart) >= 0) {
                event.preventDefault();
              } else {
                goToFirstUnfilledPosition(target);
              }
            }
            break;
          case 'keydown':
            /* Upon left or right arrow, we need to move the caret to
            the next valid position to the right direction */
            if (key === 'ArrowLeft') {
              goToNearestValidPosition(target, selectionStart, 'left');
            } else if (key === 'ArrowRight') {
              goToNearestValidPosition(target, previousSelection, 'right');
            }
            break;
        }
      });
    }
  };

  return {
    format: storeValue => format(storeValue),
    normalize: (updatedValue, previousValue) =>
      normalize(updatedValue, previousValue),
    onKeyDown: event => manageCaretPosition(event),
    onChange: event => manageCaretPosition(event),
    onFocus: event => manageCaretPosition(event),
    onClick: event => manageCaretPosition(event),
    autoComplete: 'off',
  };
};
