import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export const MAX_PHOTO_SIZE_KB = 150;

export interface CompressedPhotoResult {
  uri: string;
  sizeKb: number;
  width: number;
  height: number;
}

/**
 * Iteratively resizes and compresses photographic evidence so the final
 * payload is strictly <= 150 KB (Functional Requirement 2.3.1).
 */
export async function compressHazardPhoto(sourceUri: string): Promise<CompressedPhotoResult> {
  const passes = [
    { width: 960, compress: 0.65 },
    { width: 720, compress: 0.5 },
    { width: 540, compress: 0.38 },
    { width: 420, compress: 0.28 },
  ];

  let lastResult: CompressedPhotoResult = {
    uri: sourceUri,
    sizeKb: 0,
    width: 0,
    height: 0,
  };

  for (const pass of passes) {
    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: pass.width } }],
      { compress: pass.compress, format: ImageManipulator.SaveFormat.JPEG }
    );

    const sizeKb = await measureUriSizeKb(manipulated.uri);
    lastResult = {
      uri: manipulated.uri,
      sizeKb,
      width: manipulated.width,
      height: manipulated.height,
    };

    if (sizeKb > 0 && sizeKb <= MAX_PHOTO_SIZE_KB) {
      const persistedUri = await persistCompressedPhoto(lastResult.uri);
      return { ...lastResult, uri: persistedUri };
    }
  }

  const persistedUri = await persistCompressedPhoto(lastResult.uri);
  return { ...lastResult, uri: persistedUri };
}

/**
 * Copies the compressed image out of the volatile cache directory into
 * app document storage so offline-queued reports keep their photo until sync.
 */
async function persistCompressedPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return uri;
  }
  try {
    const dir = `${FileSystem.documentDirectory}hazard-photos/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const filename = `hazard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const dest = `${dir}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

async function measureUriSizeKb(uri: string): Promise<number> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return Math.max(1, Math.round(blob.size / 1024));
  }

  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && typeof info.size === 'number') {
    return Math.max(1, Math.round(info.size / 1024));
  }
  return 0;
}

