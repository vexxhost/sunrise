interface WizardFormSubmitEvent {
  preventDefault: () => void;
}

export function preventWizardFormSubmit(event: WizardFormSubmitEvent) {
  event.preventDefault();
}
