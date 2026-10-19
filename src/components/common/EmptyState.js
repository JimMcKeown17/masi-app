import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandButton from './BrandButton';

export default function EmptyState({ title, body, footnote, action }) {
  return <View>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
    {footnote ? (React.isValidElement(footnote) ? footnote : <Text style={styles.footnote}>{footnote}</Text>) : null}
    {action ? <BrandButton {...action} size="md" style={[styles.action, action.style]} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  title: { ...typeRoles.displaySheetTitle, color: colors.text },
  body: { ...typeRoles.textParagraph, color: colors.textSecondary, marginTop: 8 },
  footnote: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 12 },
  action: { marginTop: 16 },
});
