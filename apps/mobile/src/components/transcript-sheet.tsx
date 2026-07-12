import { useRef } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type TextLayoutEvent } from "react-native";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { resolveSnippetRange } from "@ohmyscribe/shared";

import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * The visit transcript: with a snippet, an AI draft's source view (quote highlighted and
 * auto-scrolled into view); without one, the full transcript, plain.
 */
export function TranscriptSheet({
  visible,
  transcript,
  snippet,
  snippetStart,
  snippetEnd,
  onClose,
}: {
  visible: boolean;
  transcript: string | null;
  snippet: string | null;
  snippetStart: number | null;
  snippetEnd: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const transcriptOffsetY = useRef(0);
  const range = transcript
    ? resolveSnippetRange(transcript, snippet, { start: snippetStart, end: snippetEnd })
    : null;

  // Nested Text runs don't report onLayout, so locate the laid-out line containing the highlight
  // start and scroll to it, offset by the transcript block's own position in the scroll content.
  const scrollToHighlight = (event: TextLayoutEvent) => {
    if (!range) return;
    let charactersBeforeLine = 0;
    for (const line of event.nativeEvent.lines) {
      if (charactersBeforeLine + line.text.length > range.start) {
        const targetY = Math.max(0, transcriptOffsetY.current + line.y - Spacing.six);
        requestAnimationFrame(() =>
          scrollViewRef.current?.scrollTo({ y: targetY, animated: true }),
        );
        return;
      }
      charactersBeforeLine += line.text.length;
    }
  };

  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.sheet}>
        <View style={styles.header}>
          <ThemedText type="smallBold">Transcript</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <HugeiconsIcon icon={Cancel01Icon} size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
        {transcript === null ? (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary">Transcript not available.</ThemedText>
          </View>
        ) : (
          <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
            {!range && snippet ? (
              <Card style={styles.missNote}>
                <ThemedText type="small" themeColor="textSecondary">
                  {"Couldn't locate this quote in the transcript:"}
                </ThemedText>
                <ThemedText type="small">“{snippet}”</ThemedText>
              </Card>
            ) : null}
            <View
              onLayout={(event) => {
                transcriptOffsetY.current = event.nativeEvent.layout.y;
              }}
            >
              <ThemedText onTextLayout={scrollToHighlight}>
                {range ? (
                  <>
                    {transcript.slice(0, range.start)}
                    <ThemedText style={{ backgroundColor: theme.accentMuted, color: theme.accent }}>
                      {transcript.slice(range.start, range.end)}
                    </ThemedText>
                    {transcript.slice(range.end)}
                  </>
                ) : (
                  transcript
                )}
              </ThemedText>
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.three,
  },
  empty: {
    padding: Spacing.three,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  missNote: {
    gap: Spacing.one,
  },
});
