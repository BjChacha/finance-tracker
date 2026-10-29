import { showDialog } from '@/components/dialog';
import { formLabels } from "./labels";

export function confirmDiscard(): Promise<boolean> {
  return new Promise((resolve) => {
    showDialog(formLabels.discardTitle, formLabels.discardMessage, [
      { text: formLabels.keepEditing, style: "cancel", onPress: () => resolve(false) },
      { text: formLabels.discard, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
