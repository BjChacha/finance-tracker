import { useLocalSearchParams } from 'expo-router';
import { AssetDetailScreen } from '@/features/personal-assets/components/asset-detail-screen';

export default function PersonalAssetDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <AssetDetailScreen assetId={id} />;
}
