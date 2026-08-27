import chess

from app.games.chess_engine import apply_move, board_from_uci_moves, terminal_reason


def test_apply_normal_move():
    board = chess.Board()
    r = apply_move(board, "e2e4")
    assert r.ok is True
    assert r.san == "e4"
    assert r.fen == board.fen()
    assert r.result_reason is None


def test_apply_illegal_move():
    board = chess.Board()
    r = apply_move(board, "e2e5")
    assert r.ok is False
    assert r.reason == "illegal"


def test_capture_records_captured_piece():
    board = board_from_uci_moves(["e2e4", "d7d5"])
    r = apply_move(board, "e4d5")
    assert r.captured == "p"


def test_en_passant_captures_pawn():
    board = board_from_uci_moves(["e2e4", "a7a6", "e4e5", "d7d5"])
    r = apply_move(board, "e5d6")
    assert r.captured == "p"


def test_promotion():
    board = board_from_uci_moves(["a2a4", "g8f6", "a4a5", "f6g8", "a5a6", "g8f6", "a6b7", "f6g8"])
    r = apply_move(board, "b7a8q")
    assert r.ok is True
    assert r.san == "bxa8=Q"
    assert r.result_reason is None


def test_checkmate_detected():
    board = board_from_uci_moves(["f2f3", "e7e5", "g2g4"])
    r = apply_move(board, "d8h4")
    assert r.result_reason == "checkmate"
    assert r.winner == "b"


def test_stalemate_detected():
    board = board_from_uci_moves(["e2e3", "a7a5", "d1h5", "a8a6", "h5a5", "h7h5", "h2h4", "a6h6", "a5c7", "f7f6", "c7d7", "e8f7", "d7b7", "d8d3", "b7b8", "d3h7", "b8c8", "f7g6"])
    r = apply_move(board, "c8e6")
    assert r.result_reason == "stalemate"


def test_threefold_detected():
    board = chess.Board()
    for uci in ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]:
        apply_move(board, uci)
    assert terminal_reason(board) == "threefold"
