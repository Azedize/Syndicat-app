import React from "react";
import { Modal, type ModalProps, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { ToastContainer } from "@/components/ToastContainer";

/**
 * A modal whose content makes room for the keyboard. Android draws edge to edge: the system no
 * longer resizes the window, and the fields of a plain Modal ended up hidden under the keyboard.
 * A native Modal is drawn above the whole app, toasts included: it shows its own toast layer, or a
 * validation or server error raised from the form would stay invisible behind it.
 */
export default function AppModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        {children}
      </KeyboardAvoidingView>
      <ToastContainer />
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
