import math

import numpy as np


def calculate_cosine_similarity(vector_a, vector_b):
    """Cosine similarity của hai vector cùng chiều.

    Vector rỗng, lệch chiều, hoặc chứa NaN/Infinity trả 0.0 — trước đây NaN lọt
    ra ngoài và làm hỏng việc chuyển kết quả sang JSON ("Out of range float").
    """
    try:
        a = np.asarray(vector_a, dtype=float)
        b = np.asarray(vector_b, dtype=float)
        if a.ndim != 1 or a.shape != b.shape or a.size == 0:
            return 0.0
        if not (np.isfinite(a).all() and np.isfinite(b).all()):
            return 0.0

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0

        score = float(np.dot(a, b) / (norm_a * norm_b))
        return score if math.isfinite(score) else 0.0
    except Exception as e:
        print(f"Lỗi khi tính similarity: {e}")
        return 0.0
