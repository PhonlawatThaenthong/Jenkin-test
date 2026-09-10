import 'package:flutter_bloc/flutter_bloc.dart';

import '../../repositories/auth_repository.dart';
import '../../repositories/repository_exception.dart';
import 'auth_event.dart';
import 'auth_state.dart';

/// Handles registration, login, logout and session restoration.
///
/// Owns no data source of its own: every read and write goes through
/// [AuthRepository], so switching from the mock to the REST implementation
/// changes nothing in this file.
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this._repository) : super(const AuthState()) {
    on<AuthStarted>(_onStarted);
    on<AuthLoginRequested>(_onLoginRequested);
    on<AuthRegisterRequested>(_onRegisterRequested);
    on<AuthLogoutRequested>(_onLogoutRequested);
    on<AuthStaffCreateRequested>(_onStaffCreateRequested);
    on<AuthStaffDeleteRequested>(_onStaffDeleteRequested);
  }

  final AuthRepository _repository;

  Future<void> _onStarted(AuthStarted event, Emitter<AuthState> emit) async {
    try {
      final users = await _repository.listUsers();
      final user = await _repository.restoreSession();
      emit(state.copyWith(
        initialised: true,
        users: users,
        currentUser: user,
        clearCurrentUser: user == null,
        status: user != null
            ? AuthStatus.authenticated
            : AuthStatus.unauthenticated,
      ));
    } on RepositoryException catch (e) {
      emit(state.copyWith(
        initialised: true,
        status: AuthStatus.unauthenticated,
        errorMessage: e.message,
      ));
    }
  }

  Future<void> _onLoginRequested(
    AuthLoginRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.authenticating));
    try {
      final user = await _repository.login(
        email: event.email,
        password: event.password,
      );
      emit(state.copyWith(status: AuthStatus.authenticated, currentUser: user));
    } on RepositoryException catch (e) {
      emit(state.copyWith(
        status: AuthStatus.failure,
        errorMessage: e.message,
      ));
    }
  }

  Future<void> _onRegisterRequested(
    AuthRegisterRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(state.copyWith(status: AuthStatus.authenticating));
    try {
      final user = await _repository.register(
        name: event.name,
        email: event.email,
        phone: event.phone,
        password: event.password,
      );
      emit(state.copyWith(
        status: AuthStatus.authenticated,
        currentUser: user,
        users: [...state.users, user],
      ));
    } on RepositoryException catch (e) {
      emit(state.copyWith(
        status: AuthStatus.failure,
        errorMessage: e.message,
      ));
    }
  }

  Future<void> _onLogoutRequested(
    AuthLogoutRequested event,
    Emitter<AuthState> emit,
  ) async {
    await _repository.clearSession();
    emit(state.copyWith(
      status: AuthStatus.unauthenticated,
      clearCurrentUser: true,
    ));
  }

  Future<void> _onStaffCreateRequested(
    AuthStaffCreateRequested event,
    Emitter<AuthState> emit,
  ) async {
    try {
      final staff = await _repository.createStaff(
        name: event.name,
        email: event.email,
        phone: event.phone,
        password: event.password,
        role: event.role,
      );
      emit(state.copyWith(users: [...state.users, staff]));
    } on RepositoryException catch (e) {
      emit(state.copyWith(errorMessage: e.message));
    }
  }

  Future<void> _onStaffDeleteRequested(
    AuthStaffDeleteRequested event,
    Emitter<AuthState> emit,
  ) async {
    if (state.currentUser?.id == event.id) {
      emit(state.copyWith(errorMessage: 'You cannot delete your own account.'));
      return;
    }
    try {
      await _repository.deleteUser(event.id);
      emit(state.copyWith(
        users: state.users.where((u) => u.id != event.id).toList(),
      ));
    } on RepositoryException catch (e) {
      emit(state.copyWith(errorMessage: e.message));
    }
  }
}
