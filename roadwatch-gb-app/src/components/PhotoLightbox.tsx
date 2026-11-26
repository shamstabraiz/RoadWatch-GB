import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { RADIUS, SPACING, TYPE } from '../theme/tokens';

interface PhotoLightboxProps {
  uri: string | null;
  caption?: string;
  onClose: () => void;
}

export function PhotoLightbox({ uri, caption, onClose }: PhotoLightboxProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={Boolean(uri)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo preview"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View
          style={[
            styles.topBar,
            {
              paddingTop: Math.max(insets.top + 8, 16),
              paddingHorizontal: SPACING.lg,
            },
          ]}
          pointerEvents="box-none"
        >
          <Text style={styles.caption} numberOfLines={1}>
            {caption ?? ''}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close lightbox"
            style={styles.closeBtn}
            onPress={onClose}
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {Boolean(uri) && (
          <View style={styles.imageWrap} pointerEvents="none">
            <Image
              source={{ uri: uri! }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: SPACING.sm,
  },
  caption: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: TYPE.sm,
    fontWeight: '600',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '100%',
    height: '82%',
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.control,
  },
});
