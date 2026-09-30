from ozon_reviews.responder import pick_reply, run


class FakeClient:
    def __init__(self, reviews):
        self.reviews = reviews
        self.sent = []

    def list_unprocessed(self):
        return iter(self.reviews)

    def reply(self, review_id, text):
        self.sent.append((review_id, text))


def test_pick_reply_by_rating():
    assert "Спасибо за тёплый отзыв" in pick_reply(5)
    assert "Спасибо, что поделились" in pick_reply(3)
    assert "очень жаль" in pick_reply(1)


def test_dry_run_sends_nothing():
    client = FakeClient([{"id": "a", "rating": 5, "text": "ок"}])
    assert run(client, send=False) == 1
    assert client.sent == []


def test_send_replies():
    client = FakeClient([{"id": "a", "rating": 2}, {"id": "b", "rating": 5}])
    run(client, send=True, pause=0)
    assert [i for i, _ in client.sent] == ["a", "b"]
