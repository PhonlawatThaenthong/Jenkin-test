/// Base failure type for every repository operation.
///
/// The mock implementations throw it for business-rule failures (duplicate
/// email, wrong password). The HTTP implementations added in Phase 2 will also
/// throw it for network and non-2xx responses, so the Blocs need no change:
/// they already map [message] onto their error state.
class RepositoryException implements Exception {
  final String message;

  /// HTTP status code when the failure came from the API; null for mock/local
  /// failures.
  final int? statusCode;

  const RepositoryException(this.message, {this.statusCode});

  @override
  String toString() => 'RepositoryException($message)';
}

/// Authentication-specific failure (bad credentials, expired session).
class AuthException extends RepositoryException {
  const AuthException(super.message, {super.statusCode});
}
