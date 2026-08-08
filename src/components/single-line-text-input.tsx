import { forwardRef } from 'react';
import { Platform, StyleSheet, TextInput, type TextInputProps } from 'react-native';

export type SingleLineTextInputProps = Omit<TextInputProps, 'multiline'> & {
  multiline?: never;
};

export const SingleLineTextInput = forwardRef<TextInput, SingleLineTextInputProps>(
  function SingleLineTextInput({ style, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        {...props}
        multiline={false}
        underlineColorAndroid="transparent"
        style={[style, styles.singleLine]}
      />
    );
  },
);

const styles = StyleSheet.create({
  singleLine: {
    paddingTop: 0,
    paddingBottom: 0,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: 'center' as const,
      },
      default: {},
    }),
  },
});
