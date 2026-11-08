import { useLocalSearchParams } from 'expo-router';
import { AssetEditorScreen } from '@/features/personal-assets/components/asset-editor-screen';

/** 新增/编辑资产：`id` 编辑；`fromTransactionId` 从支出生成（预填） */
export default function PersonalAssetEditRoute() {
  const params = useLocalSearchParams<{ id?: string; fromTransactionId?: string }>();
  return (
    <AssetEditorScreen assetId={params.id} fromTransactionId={params.fromTransactionId} />
  );
}
