from dataclasses import dataclass

import chess

STARTING_FEN = chess.STARTING_FEN


@dataclass
class MoveResult:
    ok: bool
    reason: str | None = None
    san: str | None = None
    uci: str | None = None
    fen: str | None = None
    captured: str | None = None
    result_reason: str | None = None
    winner: str | None = None


def board_from_uci_moves(uci_moves: list[str]) -> chess.Board:
    board = chess.Board()
    for u in uci_moves:
        board.push_uci(u)
    return board


def terminal_reason(board: chess.Board) -> str | None:
    if board.is_checkmate():
        return "checkmate"
    if board.is_stalemate():
        return "stalemate"
    if board.is_insufficient_material():
        return "insufficient"
    if board.can_claim_threefold_repetition():
        return "threefold"
    if board.can_claim_fifty_moves():
        return "fifty-move"
    return None


def _winner_for(board: chess.Board, reason: str) -> str | None:
    if reason == "checkmate":
        return "w" if board.turn == chess.BLACK else "b"
    return None


def apply_move(board: chess.Board, uci: str) -> MoveResult:
    try:
        move = board.parse_uci(uci)
    except ValueError:
        return MoveResult(ok=False, reason="illegal")
    if move not in board.legal_moves:
        return MoveResult(ok=False, reason="illegal")

    captured = None
    if board.is_capture(move):
        piece = board.piece_at(move.to_square)
        captured = "p" if piece is None else piece.symbol().lower()

    san = board.san(move)
    board.push(move)
    reason = terminal_reason(board)
    return MoveResult(
        ok=True,
        san=san,
        uci=move.uci(),
        fen=board.fen(),
        captured=captured,
        result_reason=reason,
        winner=_winner_for(board, reason) if reason else None,
    )


def export_pgn(board: chess.Board, white_name: str, black_name: str, result: str) -> str:
    game = chess.pgn.Game.from_board(board)
    game.headers["White"] = white_name
    game.headers["Black"] = black_name
    game.headers["Result"] = result
    return str(game)
