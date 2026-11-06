import React from "react";
import { Modal, type ModalProps, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

/**
 * A modal whose content makes room for the keyboard. Android draws edge to edge: the system no
 * longer resizes the window, and the fields of a plain Modal ended up hidden under the keyboard.
 */
export default function AppModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
