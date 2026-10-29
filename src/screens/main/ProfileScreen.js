import React, { useContext, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOffline } from '../../context/OfflineContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { useSignOutFlow } from '../../hooks/useSignOutFlow';
import BrandButton from '../../components/common/BrandButton';
import IconTile from '../../components/common/IconTile';
import ListGroup from '../../components/common/ListGroup';
import ListRow from '../../components/common/ListRow';
import SectionHeader from '../../components/common/SectionHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import ProfileIdentity from '../../components/profile/ProfileIdentity';
import AppReleaseInfo from '../../components/profile/AppReleaseInfo';
import ChangePasswordSheet from '../../components/profile/ChangePasswordSheet';
import ExportDatabaseSheet from '../../components/profile/ExportDatabaseSheet';
import SignOutSheets from '../../components/profile/SignOutSheets';
import ReportProblemSheet from '../../components/profile/ReportProblemSheet';
import SendDiagnosticsSheet from '../../components/profile/SendDiagnosticsSheet';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { isQuestionGalleryEnabled } from '../../utils/questionGallery';
import { exportDatabase, exportLogs } from '../../utils/debugExport';
import { getReleaseMetadata } from '../../utils/releaseMetadata';
import { getRuntimeDiagnostics } from '../../utils/runtimeDiagnostics';
import { sendObservabilityTest } from '../../services/observability';
import { isStaleActorError } from '../../session/staleActor';

export default function ProfileScreen({ navigation }) {
  const { handle, repositories, services } = useSignedInEA();
  const toast = useToast();

  const { user, profile, signOut, changePassword } = useAuth();
  const { isSignedIn, handleSignOut } = useTimeTracking();
  const { isOnline, syncNow } = useOffline();
  const signOutFlow = useSignOutFlow({
    signOut, countUnsent: repositories.syncOutbox.countUnsent,
    isClockedIn: isSignedIn, clockOut: handleSignOut, isOnline, syncNow,
  });
  const releaseMetadata = getReleaseMetadata();
  const runtimeDiagnostics = getRuntimeDiagnostics();
  const navigationContext = useContext(NavigationContext);

  const galleryEnabled = isQuestionGalleryEnabled();
  const paddingBottom = useScrollBottomPadding(40);
  const onScroll = useHeaderHairline();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const databaseExportRunning = useRef(false);
  const supportSubmission = useRef(null);

  // Debug export state
  const [logsExportLoading, setLogsExportLoading] = useState(false);
  const [databaseExportLoading, setDatabaseExportLoading] = useState(false);
  const [reportTestLoading, setReportTestLoading] = useState(false);

  const showMessage = (message, type = 'success') => {
    toast.show({
      message,
      tone: type,
      duration: 4000,
    });
  };

  const submitSupport = async (kind, { message, screenshotFile } = {}) => {
    // Capture the actor and the lease before the first await. Dismissing a sheet
    // abandons its form, but cannot admit a second report while this one saves.
    const actor = handle;
    if (!actor.isCurrent()) return { abandoned: true };
    if (supportSubmission.current) return { error: 'A report is still being saved. Please wait and try again.' };
    const attempt = {};
    supportSubmission.current = attempt;
    try {
      const incidents = services.supportIncidents;
      const payload = kind === 'ea_report'
        ? { message, screenshotAttached: Boolean(screenshotFile), screen: 'Profile' }
        : { trigger: 'manual' };
      const result = kind === 'ea_report'
        ? await incidents.captureEvent(kind, payload, { screenshotFile })
        : await incidents.captureEvent(kind, payload);
      if (!actor.isCurrent()) return { abandoned: true };
      const failure = { error: kind === 'ea_report'
        ? 'Could not save your report. Please try again.' : 'Could not save diagnostics. Please try again.' };
      if (result?.saved !== true || !result.incidentRef) return failure;
      try { await syncNow(); }
      catch (error) { if (isStaleActorError(error)) throw error; }
      if (!actor.isCurrent()) return { abandoned: true };
      const delivery = await incidents.getDeliveryState(result.incidentRef);
      if (!actor.isCurrent()) return { abandoned: true };
      if (delivery !== 'sent' && delivery !== 'pending') return failure;
      showMessage(delivery === 'sent' ? 'Sent. Thank you.' : "Saved on your phone. It will send when you're online.");
      return {};
    } catch (error) {
      if (!actor.isCurrent() || isStaleActorError(error)) return { abandoned: true };
      throw error;
    } finally {
      if (supportSubmission.current === attempt) supportSubmission.current = null;
    }
  };

  const handleShareLogs = async () => {
    setLogsExportLoading(true);
    try {
      const result = await exportLogs();
      if (result.success) {
        showMessage('Logs exported successfully');
      } else {
        showMessage(result.error || 'Failed to export logs', 'error');
      }
    } catch (error) {
      console.error('Share logs error:', error);
      showMessage('Failed to export logs', 'error');
    } finally {
      setLogsExportLoading(false);
    }
  };

  const handleShareDatabase = () => {
    if (!databaseExportRunning.current) setExportOpen(true);
  };

  const handleConfirmExport = async () => {
    // State alone cannot refuse two taps in the same render.
    if (databaseExportRunning.current) return;
    databaseExportRunning.current = true;
    setExportOpen(false);
    setDatabaseExportLoading(true);
    try {
      const result = await exportDatabase({ handle });
      if (result.success) {
        showMessage('Database exported successfully');
      } else {
        showMessage(result.error || 'Failed to export database', 'error');
      }
    } catch (error) {
      console.error('Share database error:', error);
      showMessage('Failed to export database', 'error');
    } finally {
      databaseExportRunning.current = false;
      setDatabaseExportLoading(false);
    }
  };

  const handleSendObservabilityTest = async () => {
    setReportTestLoading(true);
    try {
      const result = await sendObservabilityTest();
      showMessage(
        result.success ? 'Crash reporting test sent' : result.error,
        result.success ? 'success' : 'error'
      );
    } catch (error) {
      console.error('Crash reporting test error:', error);
      showMessage('Could not send crash reporting test', 'error');
    } finally {
      setReportTestLoading(false);
    }
  };

  const handleOpenTerms = async () => {
    try {
      const url = 'https://masinyusane.org/terms';
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        showMessage('Cannot open URL', 'error');
      }
    } catch (error) {
      console.error('Open terms error:', error);
      showMessage('Failed to open Terms & Conditions', 'error');
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      const url = 'https://www.masinyusane.org/privacy';
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        showMessage('Cannot open URL', 'error');
      }
    } catch (error) {
      console.error('Open privacy policy error:', error);
      showMessage('Failed to open Privacy Policy', 'error');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom }]}
        onScroll={navigationContext ? onScroll : undefined}
        scrollEventThrottle={16}
      >
        <ProfileIdentity profile={profile} email={user?.email} />

        <View style={styles.section}>
          <SectionHeader title="Profile info" />
          <ListGroup>
            <ListRow variant="readOnly" title="Email" subtitle={user?.email}
              lead={<IconTile icon="mail-outline" />} />
            {profile?.schoolName ? <ListRow variant="readOnly" title="Assigned school"
              subtitle={profile.schoolName} lead={<IconTile icon="school-outline" />} /> : null}
          </ListGroup>
          <View style={styles.footnote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary}
              style={styles.footnoteIcon} accessible={false} />
            <Text style={styles.footnoteText}>Profile information is managed by administrators</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Account & support" />
          <ListGroup>
            <ListRow title="Change password" lead={<IconTile icon="lock-closed-outline" />}
              trailing="chevron" accessibilityLabel="Change password" onPress={() => setPasswordOpen(true)} />
            <View>
              <ListRow title="Support tools" lead={<IconTile icon="help-buoy-outline" />}
                trailing="disclosure" expanded={supportOpen} accessibilityLabel="Support tools"
                subtitle={supportOpen ? 'Report a problem or share app information with Masi' : 'Report\u00a0a\u00a0problem · Send\u00a0diagnostics · Share\u00a0logs · Share\u00a0database · Test\u00a0crash\u00a0reporting'}
                onPress={() => setSupportOpen((open) => !open)} />
              {supportOpen ? <View style={styles.supportPanel}>
                <ListRow variant="nested" title="Report a problem" lead={<Ionicons name="chatbox-outline" size={20} color={colors.text} />}
                  trailing="chevron" onPress={() => setReportOpen(true)} showDivider />
                <ListRow variant="nested" title="Send diagnostics" lead={<Ionicons name="information-circle-outline" size={20} color={colors.text} />}
                  trailing="chevron" onPress={() => setDiagnosticsOpen(true)} showDivider />
                <ListRow variant="nested" title="Share logs" lead={<Ionicons name="document-text-outline" size={20} color={colors.text} />}
                  trailing="share" busy={logsExportLoading} onPress={handleShareLogs} showDivider />
                <ListRow variant="nested" title="Share database" titleAccessory={<StatusBadge label="Sensitive" tone="warning" />}
                  lead={<Ionicons name="server-outline" size={20} color={colors.text} />}
                  trailing="share" busy={databaseExportLoading} accessibilityLabel="Share database, sensitive"
                  onPress={handleShareDatabase} showDivider />
                <ListRow variant="nested" title="Test crash reporting" lead={<Ionicons name="bug-outline" size={20} color={colors.text} />}
                  trailing="send" busy={reportTestLoading} onPress={handleSendObservabilityTest} showDivider={galleryEnabled} />
                {galleryEnabled ? <ListRow variant="nested" title="Question gallery"
                  lead={<Ionicons name="grid-outline" size={20} color={colors.text} />}
                  trailing="chevron" onPress={() => navigation.navigate('QuestionGallery')} /> : null}
              </View> : null}
            </View>
          </ListGroup>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Legal" />
          <ListGroup>
            <ListRow title="Terms & Conditions" lead={<IconTile icon="document-text-outline" />}
              trailing="external" accessibilityRole="link" accessibilityLabel="Terms & Conditions, opens in browser"
              onPress={handleOpenTerms} />
            <ListRow title="Privacy Policy" lead={<IconTile icon="shield-checkmark-outline" />}
              trailing="external" accessibilityRole="link" accessibilityLabel="Privacy Policy, opens in browser"
              onPress={handleOpenPrivacyPolicy} />
          </ListGroup>
        </View>

        <View style={styles.releaseInfo}>
          <AppReleaseInfo releaseMetadata={releaseMetadata} runtimeDiagnostics={runtimeDiagnostics} />
        </View>
        <BrandButton variant="destructiveQuiet" size="lg" icon="log-out-outline" label="Sign out"
          loading={signOutFlow.busy === 'signing_out'} onPress={signOutFlow.start} style={styles.signOut} />
      </ScrollView>

      <SignOutSheets {...signOutFlow} isOnline={isOnline} />
      <ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)}
        changePassword={changePassword} handle={handle} />
      <ExportDatabaseSheet visible={exportOpen} onExport={handleConfirmExport} onCancel={() => setExportOpen(false)} />
      <ReportProblemSheet visible={reportOpen} handle={handle} onClose={() => setReportOpen(false)}
        onSubmit={(values) => submitSupport('ea_report', values)} />
      <SendDiagnosticsSheet visible={diagnosticsOpen} handle={handle} onClose={() => setDiagnosticsOpen(false)}
        onSubmit={() => submitSupport('diagnostics_sent')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingTop: spacing.ml, paddingHorizontal: spacing.lg },
  section: { marginTop: spacing.xl },
  footnote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, gap: 6 },
  footnoteIcon: { marginTop: 1 },
  footnoteText: { ...typeRoles.textCaption, color: colors.textSecondary, flex: 1 },
  supportPanel: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  releaseInfo: { marginTop: spacing.lg },
  signOut: { marginTop: spacing.md },
});
